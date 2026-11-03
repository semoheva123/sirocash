import {receivingIdentityAcceptance} from './receiving-identity-postgres';
import {schedulerHttpAcceptance} from './postgres-scheduler-http';
import {dualResourceBudgetAcceptance} from './dual-resource-budget';
import assert from 'node:assert/strict';
import {financialReadTransactions} from '../lib/financial-read-transactions';
import {readFinancialSnapshot} from '../lib/financial-status';
import {financialNotificationFixture,committedNetworkEvent} from './postgres-financial-events';
import {depositDiscoveryAcceptance} from './deposit-discovery-acceptance';
import {createDepositValuationWorker} from '../lib/deposit-valuation-worker';
import {customerFinancialCommands} from '../lib/customer-financial-commands';
import {observeUsdtUsdPrice} from '../lib/financial-price';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Client,Pool} from 'pg';
import {creditConfirmedDeposit,reserveWithdrawal,submitWithdrawal,settleWithdrawal,transferWallet,walletBalances,moneyMicros,type WalletDb} from '../lib/wallet-engine';
import {runFinancialWorkerBatch} from '../lib/financial-worker';
import {restoreFixtureDrill} from './postgres-restore-drill';
import {verifyFinancialSchema} from '../lib/financial-schema';

/** Destructive fixture databases ONLY. Never reads DATABASE_URL or production credentials. */
async function main(){
 const value=process.env.SIRO_TEST_POSTGRES_URL;
 if(process.env.SIRO_ALLOW_ISOLATED_POSTGRES_TESTS!=='true'||!value)throw new Error('EXPLICIT_ISOLATED_POSTGRES_TEST_CONFIGURATION_REQUIRED');
 const url=new URL(value);
 if(!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)||url.pathname!=='/postgres')throw new Error('LOCAL_FIXTURE_CLUSTER_REQUIRED');
 const admin=new Client({connectionString:value});await admin.connect();
 const name='siro_test_'+randomUUID().replaceAll('-',''),testUrl=new URL(value);testUrl.pathname='/'+name;
 let pool:Pool|undefined;
 const pids=new Set<number>();
 try{
  await admin.query(`CREATE DATABASE "${name}"`);
  pool=new Pool({connectionString:testUrl.toString(),max:24,options:'-c statement_timeout=15000 -c lock_timeout=10000 -c timezone=UTC'});
  // Fixture cluster may be reused. Existing named roles must retain their non-login safety attributes.
  for(const role of ['anon','authenticated'])await admin.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
  const legacyBeforeUid=randomUUID();
  for(const dir of (await readdir('prisma/migrations')).sort()){
   if(dir.endsWith('.toml'))continue;
   let sql=await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8');
   if(dir==='20261031230000_financial_worker_role'){
    const exists=await admin.query("SELECT 1 FROM pg_roles WHERE rolname='sirocash_financial_worker'");
    if(exists.rowCount)sql=sql.replace('CREATE ROLE sirocash_financial_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;','');
   }
   if(dir==='20261103010000_receiving_uid')await pool.query('INSERT INTO "User" (id,email,"emailVerifiedAt") VALUES ($1,$2,now())',[legacyBeforeUid,'uid-backfill@example.test']);
   await pool.query(sql);
  }
  assert.equal((await pool.query('SELECT count(*) FROM "ReceivingIdentity" WHERE "userId"=$1',[legacyBeforeUid])).rows[0].count,'1','Existing accounts are backfilled before new registrations');
  const db:WalletDb={transaction:async run=>{
   const c=await pool!.connect();
   try{pids.add(Number((await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid));await c.query('BEGIN');await c.query('SET LOCAL ROLE sirocash_financial_worker');const result=await run(c);await c.query('COMMIT');return result}
   catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
  }};
  await schedulerHttpAcceptance(pool);
  // Independent-session scheduler capability race: exactly one committed consumer.
  const monitorHash=createHash('sha256').update(randomUUID()).digest('hex');
  await pool.query('UPDATE "DepositMonitorSchedule" SET enabled=true WHERE id=1');
  await pool.query('INSERT INTO "DepositMonitorTicket" ("tokenHash","expiresAt") VALUES ($1,clock_timestamp()+interval \'2 minutes\')',[monitorHash]);
  const ticketRace=await Promise.all(Array.from({length:16},()=>db.transaction(async tx=>
   (await tx.query('SELECT public.consume_deposit_monitor_ticket($1) AS accepted',[monitorHash])).rows[0].accepted)));
  assert.equal(ticketRace.filter(Boolean).length,1,'Only one independent session may consume a scheduler ticket');
  await pool.query('UPDATE "DepositMonitorSchedule" SET enabled=false WHERE id=1');
  const alice=randomUUID(),bob=randomUUID(),settlement=randomUUID(),revenue=randomUUID();
  await pool.query('INSERT INTO "User" (id,email,"emailVerifiedAt","kycStatus") VALUES ($1,\'race-alice@example.test\',now(),\'VERIFIED\'),($2,\'race-bob@example.test\',now(),\'VERIFIED\')',[alice,bob]);
  await pool.query('INSERT INTO "LedgerAccount" (id,"accountType") VALUES ($1,\'MASTER_POOL\'),($2,\'MASTER_POOL\')',[settlement,revenue]);
  await receivingIdentityAcceptance(pool,db,alice,bob);
  await financialNotificationFixture(pool,testUrl.toString(),alice);
  // Read-only display is independent of command activation, using actual restricted-role SQL.
  const readPool={connect:async()=>{const c=await pool!.connect();await c.query('SET ROLE sirocash_financial_worker');return {query:c.query.bind(c),release:()=>c.release(true)}}} as unknown as Pick<Pool,'connect'>;
  const readDb=financialReadTransactions(readPool);
  const emptyRead=await readDb.transaction(tx=>readFinancialSnapshot(tx,bob));assert.equal(emptyRead.balance.posted,'0');assert.equal(emptyRead.balance.held,'0');
  const existingEmptyRead=await readDb.transaction(tx=>readFinancialSnapshot(tx,alice));assert.equal(existingEmptyRead.balance.posted,'0.000000');
  await assert.rejects(()=>readDb.transaction(tx=>tx.query('UPDATE "LedgerAccount" SET balance=1')),/read.only/i);
  const deposit={ownerId:alice,requestKey:'postgres:deposit:replay',amount:'100',providerReference:'fixture:postgres:deposit:1',settlementAccountId:settlement};
  const credits=await Promise.all(Array.from({length:16},()=>creditConfirmedDeposit(db,deposit)));
  assert.equal(new Set(credits.map(c=>c.id)).size,1);
  const duplicateEvents=await Promise.allSettled(Array.from({length:6},(_,i)=>creditConfirmedDeposit(db,{...deposit,requestKey:'postgres:duplicate:event:'+i})));
  for(const r of duplicateEvents){assert.equal(r.status,'rejected');if(r.status==='rejected')assert.match(String(r.reason),/IDEMPOTENCY_CONFLICT/)}
  await assert.rejects(()=>creditConfirmedDeposit(db,{...deposit,ownerId:bob,requestKey:'postgres:foreign:event'}),/IDEMPOTENCY_CONFLICT/);
  assert.equal((await walletBalances(db,alice)).available,'100.000000');
  const postedRead=await readDb.transaction(tx=>readFinancialSnapshot(tx,alice));assert.equal(postedRead.balance.posted,'100.000000');assert.equal(postedRead.activity.length,1);
  const otherRead=await readDb.transaction(tx=>readFinancialSnapshot(tx,bob));assert.equal(otherRead.balance.posted,'0');assert.equal(otherRead.activity.length,0);
  assert(pids.size>=2,'must use independent PostgreSQL backend processes, not serialized PGlite');
  const competing=await Promise.allSettled(Array.from({length:12},(_,i)=>transferWallet(db,{ownerId:alice,recipientId:bob,feeAccountId:revenue,requestKey:'postgres:competing:'+i,amount:'60'})));
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
  for(const r of competing)if(r.status==='rejected')assert.match(String(r.reason),/INSUFFICIENT_AVAILABLE_BALANCE/);
  assert.equal((await walletBalances(db,alice)).available,'39.400000');
  assert.equal((await walletBalances(db,bob)).available,'60.000000');
  const reserve={ownerId:bob,requestKey:'postgres:hold:replay',amount:'50',destination:'fixture:withdrawal:no-network'};
  const reservations=await Promise.all(Array.from({length:12},()=>reserveWithdrawal(db,reserve)));
  assert.equal(new Set(reservations.map(r=>r.id)).size,1);
  const id=reservations[0].id;
  assert.equal((await walletBalances(db,bob)).available,'10.000000');
  await Promise.all(Array.from({length:8},()=>submitWithdrawal(db,id)));
  const evidence={outcome:'confirmed' as const,providerReference:'fixture:postgres:final:withdrawal:1',settlementAccountId:settlement};
  const settled=await Promise.all(Array.from({length:12},()=>settleWithdrawal(db,id,evidence)));
  assert.equal(new Set(settled.map(r=>r.transactionId)).size,1);
  assert.equal((await walletBalances(db,bob)).posted,'10.000000');
  await assert.rejects(()=>settleWithdrawal(db,id,{...evidence,outcome:'rejected'}),/SETTLEMENT_CONFLICT/);
  // Customer commands use actual restricted-role transactions and session/approval SQL bridges.
  const sessionHash='a'.repeat(64),credential='fixture-credential',context={userId:alice,sessionHash,origin:'https://sirocash.example',rpID:'sirocash.example'};
  await pool.query('INSERT INTO "AuthSession" ("tokenHash","userId","expiresAt") VALUES ($1,$2,now()+interval \'1 hour\')',[sessionHash,alice]);
  await pool.query('INSERT INTO "DurablePasskeyCredential" (id,"userId","rpId","publicKey",counter) VALUES ($1,$2,$3,\'fixture-no-real-key\',0)',[credential,alice,context.rpID]);
  const commands=customerFinancialCommands(db,{settlementAccountId:settlement,feeAccountId:revenue,price:()=>observeUsdtUsdPrice(async()=>new Response(JSON.stringify({data:{base:'USDT',currency:'USD',amount:'0.998'}})))});
  const approve=async(digest:string)=>{const token=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');const tokenHash=createHash('sha256').update(token).digest('hex');await pool!.query('INSERT INTO "DurablePaymentApproval" ("tokenHash","sessionHash","credentialId",digest,"expiresAt") VALUES ($1,$2,$3,$4,now()+interval \'1 minute\')',[tokenHash,sessionHash,credential,digest]);return {token,tokenHash}};
  const customerTransfer={kind:'TRANSFER',recipient:bob,amount:'5',requestKey:'postgres:customer:transfer'};
  const prepared=await commands.prepare(context,customerTransfer),approval=await approve(prepared.digest);
  await assert.rejects(()=>commands.transfer(context,{...customerTransfer,amount:'6'},approval.token),/PAYMENT_APPROVAL_REQUIRED/);
  const moved=await commands.transfer(context,customerTransfer,approval.token);
  assert.equal((await commands.transfer(context,customerTransfer,approval.token)).id,moved.id);
  await assert.rejects(()=>commands.transfer(context,{...customerTransfer,amount:'6'},approval.token),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(()=>commands.prepare({...context,userId:bob},customerTransfer),/PASSKEY_SESSION_EXPIRED/);
  const request={kind:'WITHDRAWAL',recipient:'THici1qxA1dQZK52fJ18RHX8j1Ef1ktyDD',asset:'USDT',chain:'TRC20',amount:'10',requestKey:'postgres:customer:withdraw'};
  const quote=await commands.prepare(context,request);assert.equal(quote.kind,'WITHDRAWAL');
  if(quote.kind!=='WITHDRAWAL')throw Error('quote fixture');
  assert.equal(quote.grossUsd,'9.980000');assert.equal(quote.feeUsd,'4.990000');
  const paidApproval=await approve(quote.digest);
  const reserved=await commands.withdraw(context,{quoteId:quote.id},paidApproval.token);
  assert.equal((await commands.withdraw(context,{quoteId:quote.id},paidApproval.token)).operation.id,reserved.operation.id);
  await assert.rejects(()=>commands.withdraw({...context,userId:bob},{quoteId:quote.id},paidApproval.token),/PASSKEY_SESSION_EXPIRED/);
  const expensive=await commands.prepare(context,{...request,amount:'99',requestKey:'postgres:customer:rollback'});
  if(expensive.kind!=='WITHDRAWAL')throw Error('quote fixture');
  const failedApproval=await approve(expensive.digest);
  await assert.rejects(()=>commands.withdraw(context,{quoteId:expensive.id},failedApproval.token),/INSUFFICIENT_AVAILABLE_BALANCE/);
  assert.equal((await pool.query('SELECT "consumedAt" FROM "DurablePaymentApproval" WHERE "tokenHash"=$1',[failedApproval.tokenHash])).rows[0].consumedAt,null);
  // Fixture cleanup of an unsigned reservation only, so subsequent global-cap math stays explicit.
  await pool.query('UPDATE "WalletOperation" SET state=\'FAILED\',"externalReference"=\'fixture:unsigned:cancelled\' WHERE id=$1',[reserved.operation.id]);
  await assert.rejects(()=>db.transaction(tx=>tx.query('SELECT "passwordHash" FROM "User"')),/permission denied/);
  await assert.rejects(()=>db.transaction(tx=>tx.query('SELECT * FROM "AuthSession"')),/permission denied/);
  await assert.rejects(()=>db.transaction(tx=>tx.query('UPDATE "User" SET id=id')),/row-level security/);
  await assert.rejects(()=>db.transaction(tx=>tx.query('UPDATE "LedgerAccount" SET balance=balance+1')),/permission denied/);
  // Independent owners compete for the final shared $1,000 of the $10,000 platform hold limit.
  const owners=Array.from({length:11},()=>randomUUID());
  for(const [i,ownerId] of owners.entries()){
   await pool.query('INSERT INTO "User" (id,email,"emailVerifiedAt","kycStatus") VALUES ($1,$2,now(),\'VERIFIED\')',[ownerId,`global-${i}@example.test`]);
   await creditConfirmedDeposit(db,{ownerId,requestKey:'postgres:global:deposit:'+i,amount:'2000',providerReference:'fixture:global:deposit:'+i,settlementAccountId:settlement});
  }
  // Prior completed $50 still counts today: reserve $8,950, then race two $1,000 commands.
  for(let i=0;i<9;i++)await reserveWithdrawal(db,{ownerId:owners[i],requestKey:'postgres:global:base:'+i,amount:i===8?'950':'1000',destination:'fixture:global:base'});
  const global=await Promise.allSettled([9,10].map(i=>reserveWithdrawal(db,{ownerId:owners[i],requestKey:'postgres:global:race:'+i,amount:'1000',destination:'fixture:global:race'})));
  assert.equal(global.filter(r=>r.status==='fulfilled').length,1);
  assert.match(String((global.find(r=>r.status==='rejected') as PromiseRejectedResult).reason),/PLATFORM_DAILY_WITHDRAWAL_LIMIT_EXCEEDED/);
  // A real assigned deposit address supplies DEPOSIT_SCAN and PREPARE_SWEEP, without any keys or network calls.
  const vault=randomUUID(),address=randomUUID();
  await pool.query('INSERT INTO "DepositAddressVault" (id,network,"accountXpub",enabled,"originVerified") VALUES ($1,\'TRC20\',\'xpub-fixture-not-a-key\',true,true)',[vault]);
  await committedNetworkEvent(testUrl.toString(),alice,()=>pool!.query('INSERT INTO "UserDepositAddress" (id,"ownerId","vaultId",network,address,"derivationIndex") VALUES ($1,$2,$3,\'TRC20\',\'fixture-address-no-network\',0)',[address,alice,vault]));
  let entered!:()=>void,release!:()=>void;
  const barrier=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r});
  const first=runFinancialWorkerBatch(db,{enabled:true,limit:1,process:async()=>{entered();await gate;return {state:'HELD'}}});
  await Promise.race([barrier,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('lease fixture never entered')),5000);timer.unref()})]);
  try{assert.equal((await runFinancialWorkerBatch(db,{enabled:true,process:async()=>{throw Error('must not run')}})).state,'BUSY')}finally{release();await first}
  const inbox=randomUUID();
  await committedNetworkEvent(testUrl.toString(),alice,()=>pool!.query('INSERT INTO "ChainDepositInbox" (id,"eventKey","addressId",network,"txId","logIndex","blockNumber","blockHash","amountBaseUnits",fingerprint) VALUES ($1,\'fixture:automatic:valuation\',$2,\'TRC20\',$3,0,100,$4,20000000,$5)',[inbox,address,'ab'.repeat(32),'cd'.repeat(32),'ef'.repeat(32)]));
  const pricing=()=>observeUsdtUsdPrice(async()=>new Response(JSON.stringify({data:{base:'USDT',currency:'USD',amount:'0.998'}})));
  const valuer=createDepositValuationWorker(db,{enabled:true,settlementAccountId:settlement,price:pricing});
  const beforeValue=(await walletBalances(db,alice)).posted;
  const valued=await Promise.all(Array.from({length:12},()=>valuer(inbox,new AbortController().signal)));
  assert.equal(new Set(valued.map(v=>'id' in v?v.id:undefined)).size,1);
  assert.equal((await pool.query('SELECT state FROM "ChainDepositInbox" WHERE id=$1',[inbox])).rows[0].state,'CREDITED');
  assert.equal(moneyMicros((await walletBalances(db,alice)).posted)-moneyMicros(beforeValue),19960000n);
  const priceCount=Number((await pool.query('SELECT count(*) FROM "FinancialPriceObservation"')).rows[0].count);
  await valuer(inbox,new AbortController().signal);
  assert.equal(Number((await pool.query('SELECT count(*) FROM "FinancialPriceObservation"')).rows[0].count),priceCount);
  await assert.rejects(()=>pool!.query('UPDATE "FinancialPriceObservation" SET "rateUsdMicros"=1'),/FINANCIAL_PRICE_IMMUTABLE/);
  const adminDb:WalletDb={transaction:async run=>{const c=await pool!.connect();try{await c.query('BEGIN');const result=await run(c);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}};
  await depositDiscoveryAcceptance(adminDb,db);
  // Production application role: actual permission-denial probes and catalog validation.
  const check=await pool.connect();
  try{await check.query('BEGIN READ ONLY');await check.query('SET LOCAL ROLE sirocash_app');const result=await verifyFinancialSchema((sql,params)=>check.query(sql,params));assert.equal(result.tables,30);await check.query('ROLLBACK')}finally{check.release()}
  const invariant=await pool.query('SELECT "transactionId" FROM "LedgerEntry" GROUP BY "transactionId" HAVING SUM(amount)<>0');assert.equal(invariant.rowCount,0);
  const cache=await pool.query('SELECT a.id FROM "LedgerAccount" a LEFT JOIN "LedgerEntry" e ON e."accountId"=a.id GROUP BY a.id HAVING a.balance<>COALESCE(SUM(e.amount),0)');assert.equal(cache.rowCount,0);
  // Forced exception after a real insert must leave neither operation nor balance changes.
  await assert.rejects(()=>db.transaction(async tx=>{await tx.query('UPDATE "FinancialWorkerLease" SET \"cursorTime\"=clock_timestamp(),\"cursorId\"=$1,\"cursorKind\"=\'SWEEP\' WHERE id=\'outbox\'',[randomUUID()]);throw Error('fixture-rollback')}));
  assert.equal((await pool.query('SELECT \"cursorKind\" FROM "FinancialWorkerLease" WHERE id=\'outbox\'')).rows[0].cursorKind,'DEPOSIT_SCAN');
  await dualResourceBudgetAcceptance((sql,params)=>pool!.query(sql,params),db);
  if(process.env.SIRO_TEST_RESTORE_DRILL==='true')await restoreFixtureDrill(pool,admin,testUrl);
  console.log(`Real PostgreSQL PASS: ${pids.size} independent sessions; concurrent deposit/hold/settlement replay, overspend/global-cap races, lease exclusion, application RLS denials, balanced journal, caches and rollback. No production access or external financial calls.`);
 }finally{
  await pool?.end();await admin.query(`DROP DATABASE IF EXISTS "${name}"`);await admin.end();
 }
}
main().catch(error=>{
 const detail=error instanceof Error?(error.stack??error.message):'POSTGRES_FIXTURE_FAILED';console.error(detail);
 // Keep isolated-fixture failures visible through the Checks API when log downloads are unavailable.
 if(process.env.GITHUB_ACTIONS==='true')console.error(`::error title=Isolated PostgreSQL fixture::${detail.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')}`);
 process.exitCode=1;
});
