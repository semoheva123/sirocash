import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {readOwnerFinancialStatus} from '../lib/financial-read-status';
import {financialReadTransactions} from '../lib/financial-read-transactions';
import {displayLedgerBalance} from '../lib/account-overview';
async function main(){
 const pg=new PGlite();try{
  const schema=(await readFile('tests/financial-sync.ts','utf8')).match(/await pg\.exec\(`([^`]+)`\);/)![1].split('INSERT INTO')[0];await pg.exec(schema);
  await pg.exec(`ALTER TABLE "WalletOperation" ADD COLUMN "transactionId" TEXT; ALTER TABLE "Transaction" ADD COLUMN "senderId" UUID,ADD COLUMN "receiverId" UUID; CREATE TABLE "ReceivingIdentity"("userId" UUID PRIMARY KEY,uid TEXT,"displayName" TEXT,username TEXT);`);
  await pg.exec(`CREATE TABLE "UsdtWithdrawalQuote"("operationId" TEXT,"ownerId" UUID,network TEXT,recipient TEXT,"grossTokens" NUMERIC,"feeTokens" NUMERIC,"netTokens" NUMERIC);ALTER TABLE "SignedWithdrawalOutbox" ADD COLUMN sender TEXT,ADD COLUMN recipient TEXT,ADD COLUMN "amountBaseUnits" NUMERIC;`);
  const owner='00000000-0000-0000-0000-000000000001',foreign='00000000-0000-0000-0000-000000000002';
  let released=0;const sqls:string[]=[];
  const safe={correct:true,read_only:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,app_member:false,password_access:false,auth_access:false};
  const pool={connect:async()=>({query:async(sql:string,params?:unknown[])=>{sqls.push(sql);return sql.includes('pg_roles')?{rows:[safe]}:pg.query(sql,params)},release:()=>{released++}})} as unknown as Pick<Pool,'connect'>;
  const db=financialReadTransactions(pool);
  const options={authenticate:async()=>({id:owner}),database:()=>db,enabled:()=>false,withdrawals:()=>true,deposits:()=>true};
  const empty=await readOwnerFinancialStatus(options);assert(empty);assert.equal(empty.enabled,false);assert.equal(empty.readable,true);assert.deepEqual(empty.capabilities,{withdrawals:false,deposits:false});assert.equal(empty.balance.posted,'0');assert.equal(displayLedgerBalance(empty,owner),'0.00');assert(sqls[0].includes('READ ONLY'));assert.equal(released,1);
  const depositsOnly=await readOwnerFinancialStatus({...options,enabled:()=>true,transfers:()=>false,withdrawals:()=>false});assert(depositsOnly);assert.deepEqual(depositsOnly.capabilities,{transfers:false,withdrawals:false,deposits:true});
  const untrustedShared=await readOwnerFinancialStatus({...options,authenticate:async()=>null,snapshot:async()=>{throw Error('UNAUTHENTICATED_SHARED_READ')}});assert.equal(untrustedShared,null);
  const none=await readOwnerFinancialStatus({...options,authenticate:async()=>null,database:()=>{throw Error('UNAUTHENTICATED_READ')}});assert.equal(none,null);
  await pg.exec(`INSERT INTO "LedgerAccount" VALUES ('owner','${owner}','USER','USD',12.345678),('foreign','${foreign}','USER','USD',999); INSERT INTO "Transaction"(id,type,status,"createdAt") VALUES ('foreign-entry','P2P','COMPLETED',now()); INSERT INTO "LedgerEntry" VALUES ('foreign','foreign-entry',999);`);
  const funded=await readOwnerFinancialStatus(options);assert(funded);assert.equal(funded.balance.posted,'12.345678');assert.equal(funded.activity.length,0);assert.equal(displayLedgerBalance(funded,owner),'12.34');assert(!JSON.stringify(funded).includes('999'));
  assert.equal(displayLedgerBalance(null,owner),'—');assert.equal(displayLedgerBalance({userId:owner},owner),'—');assert.equal(displayLedgerBalance({userId:foreign,balance:{posted:'99'}},owner),'—');for(const bad of ['NaN','Infinity','',0])assert.equal(displayLedgerBalance({userId:owner,balance:{posted:bad}},owner),'—');
  await assert.rejects(()=>readOwnerFinancialStatus({...options,database:()=>({transaction:async()=>{throw Error('DATABASE_UNAVAILABLE')}})}),/DATABASE_UNAVAILABLE/);
  await assert.rejects(()=>db.transaction(async tx=>{await tx.query('UPDATE "LedgerAccount" SET balance=1')}),/read.only/i);assert.equal((await pg.query<{balance:string}>('SELECT balance::text FROM "LedgerAccount" WHERE id=\'owner\'')).rows[0].balance,'12.345678');
  safe.auth_access=true;await assert.rejects(()=>db.transaction(async()=>{throw Error('MUST_NOT_RUN')}),/UNSAFE_ROLE/);safe.auth_access=false;
  const originalError=Error('ORIGINAL_READ_FAILURE');let destroyed=false;const brokenDb=financialReadTransactions({connect:async()=>({query:async(sql:string)=>{if(sql.startsWith('BEGIN'))return {rows:[]};throw originalError},release:(broken:boolean)=>{destroyed=broken}})} as unknown as Pick<Pool,'connect'>);await assert.rejects(brokenDb.transaction(async()=>{}),e=>e===originalError);assert(destroyed);
  const source=await readFile('lib/financial-database.ts','utf8'),readSource=source.slice(source.indexOf('export function financialReadDatabase'));
  assert(!readSource.includes('SIRO_OUTBOX_WORKER_ENABLED'));assert(source.slice(0,source.indexOf('export function financialReadDatabase')).includes("SIRO_OUTBOX_WORKER_ENABLED!=='true'"));
  const events=await readFile('app/api/financial/events/route.ts','utf8');assert(events.includes('enabled:()=>true'));assert(!events.includes('customerFinanceEnabled'));
  console.log('Read-only financial view PASS: authenticated owner only, disabled commands retain zero/nonzero ledger balances, no synthetic fallback, DB errors propagate, READ ONLY rejects writes, unsafe roles rejected, original write gate retained.');
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
