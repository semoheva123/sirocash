import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createUsdtWithdrawalQuote,reserveQuotedUsdtWithdrawal,settleQuotedUsdtWithdrawal} from '../lib/quoted-usdt-withdrawal';
import {creditConfirmedDeposit,submitWithdrawal,settleWithdrawal,walletBalances,type WalletDb} from '../lib/wallet-engine';
async function main(){
 const pg=new PGlite();try{
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated');
  for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
  const owner='00000000-0000-0000-0000-000000000001',pool='00000000-0000-0000-0000-000000000002',fees='00000000-0000-0000-0000-000000000003';
  await pg.query('INSERT INTO "User" (id,email,"emailVerifiedAt") VALUES ($1,\'withdrawal@example.test\',now())',[owner]);
  await pg.query('INSERT INTO "LedgerAccount" (id,"accountType") VALUES ($1,\'MASTER_POOL\'),($2,\'MASTER_POOL\')',[pool,fees]);
  await creditConfirmedDeposit(db,{ownerId:owner,requestKey:'funding:fixture:001',amount:'200',providerReference:'fixture:deposit:001',settlementAccountId:pool});
  await pg.query('INSERT INTO "AuthSession" ("tokenHash","userId","expiresAt") VALUES (\'fixture-session\',$1,now()+interval \'1 day\')',[owner]);
  await pg.query('INSERT INTO "DurablePasskeyCredential" (id,"userId","rpId","publicKey",counter) VALUES (\'fixture-key\',$1,\'wallet.example.test\',\'AQID\',0)',[owner]);
  const context={userId:owner,sessionHash:'fixture-session',rpID:'wallet.example.test',origin:'https://wallet.example.test'};
  const command={ownerId:owner,requestKey:'withdraw:quoted:001',network:'TRC20' as const,recipient:'TQo4n7EhrucXUbcNGdkiqoHjyqgvVQxyuV',grossTokens:'100',rateUsdMicrosPerToken:980000n,rateReference:'approved:fixture:rate001',expiresAt:new Date(Date.now()+90000).toISOString(),settlementAccountId:pool,feeAccountId:fees};
  const quote=await createUsdtWithdrawalQuote(db,command);
  assert.equal(quote.payload.fee,'5.000000');assert.equal(quote.payload.netAmount,'95.000000');assert.equal(quote.grossUsd,'98.000000');assert.equal(quote.feeUsd,'4.900000');assert.equal(quote.netUsd,'93.100000');
  assert.deepEqual(await createUsdtWithdrawalQuote(db,command),quote);
  await assert.rejects(()=>createUsdtWithdrawalQuote(db,{...command,grossTokens:'99'}),/QUOTE_CONFLICT/);
  await assert.rejects(()=>createUsdtWithdrawalQuote(db,{...command,requestKey:'quote:expired',expiresAt:new Date(Date.now()-1000).toISOString()}),/EXPIRY_INVALID/);
  await assert.rejects(()=>pg.query('UPDATE "UsdtWithdrawalQuote" SET "feeTokens"=6,"netTokens"=94 WHERE id=$1',[quote.id]),/IMMUTABLE_WITHDRAWAL_QUOTE/);
  const token='ab'.repeat(32),tokenHash=createHash('sha256').update(token).digest('hex');
  const approve=async(digest=quote.digest)=>pg.query('INSERT INTO "DurablePaymentApproval" ("tokenHash","sessionHash","credentialId",digest,"expiresAt") VALUES ($1,\'fixture-session\',\'fixture-key\',$2,now()+interval \'1 minute\') ON CONFLICT ("tokenHash") DO UPDATE SET digest=EXCLUDED.digest,"consumedAt"=NULL',[tokenHash,digest]);
  await approve('ff'.repeat(32));await assert.rejects(()=>reserveQuotedUsdtWithdrawal(db,context,{quoteId:quote.id,approvalToken:token}),/APPROVAL_REQUIRED/);
  await approve();
  const broken:WalletDb={transaction:run=>db.transaction(tx=>run({query:async(sql,params)=>{if(sql.startsWith('UPDATE "UsdtWithdrawalQuote"'))throw Error('injected reservation failure');return tx.query(sql,params)}}))};
  await assert.rejects(()=>reserveQuotedUsdtWithdrawal(broken,context,{quoteId:quote.id,approvalToken:token}),/injected reservation failure/);
  assert.equal((await walletBalances(db,owner)).held,'0.000000');
  assert.equal((await pg.query<{consumedAt:unknown}>('SELECT "consumedAt" FROM "DurablePaymentApproval"')).rows[0].consumedAt,null);
  const reserved=await reserveQuotedUsdtWithdrawal(db,context,{quoteId:quote.id,approvalToken:token});assert.equal(reserved.operation.state,'RESERVED');assert.equal((await walletBalances(db,owner)).held,'98.000000');
  assert.deepEqual(await reserveQuotedUsdtWithdrawal(db,context,{quoteId:quote.id,approvalToken:'already-consumed'}),reserved);
  const evidence={outcome:'confirmed' as const,providerReference:'trusted:chain:final:001'};
  await assert.rejects(()=>settleQuotedUsdtWithdrawal(db,quote.id,evidence),/NOT_SUBMITTED/);
  await submitWithdrawal(db,reserved.operation.id);
  await assert.rejects(()=>settleWithdrawal(db,reserved.operation.id,{...evidence,settlementAccountId:pool}),/QUOTED_WITHDRAWAL_SETTLEMENT_REQUIRED/);
  // A crash after posting but before operation update must roll back every ledger entry.
  const brokenSettlement:WalletDb={transaction:run=>db.transaction(tx=>run({query:async(sql,params)=>{if(sql.startsWith('UPDATE "WalletOperation"'))throw Error('injected settlement failure');return tx.query(sql,params)}}))};
  await assert.rejects(()=>settleQuotedUsdtWithdrawal(brokenSettlement,quote.id,evidence),/injected settlement failure/);
  assert.equal((await walletBalances(db,owner)).held,'98.000000');assert.equal((await walletBalances(db,owner)).posted,'200.000000');
  const paid=await settleQuotedUsdtWithdrawal(db,quote.id,evidence);assert.equal(paid.state,'COMPLETED');assert.deepEqual(await settleQuotedUsdtWithdrawal(db,quote.id,evidence),paid);
  assert.deepEqual(await walletBalances(db,owner),{currency:'USD',posted:'102.000000',available:'102.000000',held:'0.000000'});
  assert.equal((await pg.query<{balance:string}>('SELECT balance FROM "LedgerAccount" WHERE id=$1',[fees])).rows[0].balance,'4.900000');
  await assert.rejects(()=>settleQuotedUsdtWithdrawal(db,quote.id,{...evidence,outcome:'rejected'}),/SETTLEMENT_CONFLICT/);
  // BEP20 gross fee is 2 USDT, not 2 USD: value explicitly at the non-peg approved rate.
  const bep=await createUsdtWithdrawalQuote(db,{...command,network:'BEP20',recipient:'0x0000000000000000000000000000000000000002',requestKey:'withdraw:quoted:002',grossTokens:'10'});
  assert.equal(bep.payload.fee,'2.000000');assert.equal(bep.payload.netAmount,'8.000000');assert.equal(bep.feeUsd,'1.960000');
  await approve(bep.digest);const second=await reserveQuotedUsdtWithdrawal(db,context,{quoteId:bep.id,approvalToken:token});await submitWithdrawal(db,second.operation.id);
  const rejected={outcome:'rejected' as const,providerReference:'trusted:chain:reject:002'};await settleQuotedUsdtWithdrawal(db,bep.id,rejected);assert.equal((await walletBalances(db,owner)).available,'102.000000');
  const tooLarge=await createUsdtWithdrawalQuote(db,{...command,requestKey:'withdraw:identity:limit',grossTokens:'110'});
  await approve(tooLarge.digest);await assert.rejects(()=>reserveQuotedUsdtWithdrawal(db,context,{quoteId:tooLarge.id,approvalToken:token}),/WITHDRAWAL_IDENTITY_LIMIT_EXCEEDED/);
  assert.equal((await pg.query<{consumedAt:unknown}>('SELECT "consumedAt" FROM "DurablePaymentApproval" WHERE "tokenHash"=$1',[tokenHash])).rows[0].consumedAt,null);
  assert.equal((await walletBalances(db,owner)).held,'0.000000');
  const {rows:[sum]}=await pg.query<{total:string}>('SELECT sum(amount)::text AS total FROM "LedgerEntry"');assert.equal(Number(sum.total),0);
  await pg.exec('SET ROLE sirocash_app');await assert.rejects(()=>pg.exec('SELECT * FROM "UsdtWithdrawalQuote"'),/permission denied/);
  console.log('Quoted USDT withdrawals passed: immutable gross/net tariffs, explicit non-peg USD valuation, digest-bound atomic approval+hold, rollback/retry, legacy bypass rejection, three-leg settlement, rejection release and balanced ledger. Trusted evidence mocked; no chain dispatch.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
