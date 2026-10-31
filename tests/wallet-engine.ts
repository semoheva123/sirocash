import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {transferWallet,creditConfirmedDeposit,reserveWithdrawal,submitWithdrawal,settleWithdrawal,walletBalances,moneyMicros,type WalletDb,type WalletTx} from '../lib/wallet-engine';
async function main(){
 const pg=new PGlite();
 try{
  for(const path of ['20261030000000_ledger_invariants','20261030010000_payment_services','20261030020000_payment_service_constraints','20261030030000_email_auth','20261031000000_wallet_operations'])await pg.exec(await readFile('prisma/migrations/'+path+'/migration.sql','utf8'));
  const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>{const r=await tx.query(sql,params);return {rows:r.rows as Record<string,unknown>[]}}} as WalletTx))};
  const alice='00000000-0000-0000-0000-000000000001',bob='00000000-0000-0000-0000-000000000002',pool='00000000-0000-0000-0000-000000000003';
  await pg.query('INSERT INTO "User" (id,email,"emailVerifiedAt") VALUES ($1,\'alice@example.test\',CURRENT_TIMESTAMP),($2,\'bob@example.test\',CURRENT_TIMESTAMP)',[alice,bob]);
  await pg.query('INSERT INTO "LedgerAccount" (id,"accountType") VALUES ($1,\'MASTER_POOL\')',[pool]);
  const deposit={ownerId:alice,requestKey:'deposit:alice:001',amount:'100',providerReference:'provider:network:event:log-1',settlementAccountId:pool};
  const credited=await creditConfirmedDeposit(db,deposit);assert.equal(credited.state,'COMPLETED');assert.deepEqual(await creditConfirmedDeposit(db,{...deposit,amount:'100.000000'}),credited);
  await assert.rejects(()=>creditConfirmedDeposit(db,{...deposit,amount:'101'}),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(()=>creditConfirmedDeposit(db,{...deposit,requestKey:'deposit:alice:duplicate'}));
  const transfer={ownerId:alice,recipientId:bob,amount:'30',requestKey:'transfer:alice:001'};
  const sent=await transferWallet(db,transfer);assert.deepEqual(await transferWallet(db,transfer),sent);
  assert.deepEqual(await walletBalances(db,alice),{currency:'USD',posted:'70.000000',available:'70.000000',held:'0.000000'});
  assert.equal((await walletBalances(db,bob)).available,'30.000000');
  assert.throws(()=>transferWallet(db,{...transfer,recipientId:alice}),/SELF_TRANSFER/);
  const held=await reserveWithdrawal(db,{ownerId:alice,requestKey:'withdraw:alice:001',amount:'50',destination:'USDT:TRC20:test-destination'});assert.equal(held.state,'RESERVED');
  assert.equal((await walletBalances(db,alice)).available,'20.000000');
  await assert.rejects(()=>transferWallet(db,{...transfer,amount:'25',requestKey:'transfer:too-much'}),/INSUFFICIENT_AVAILABLE_BALANCE/);
  assert.equal((await pg.query<{n:number}>('SELECT count(*)::int AS n FROM "WalletOperation" WHERE "requestKey"=\'transfer:too-much\'')).rows[0].n,0);
  await transferWallet(db,{...transfer,amount:'20',requestKey:'transfer:alice:002'});
  await assert.rejects(()=>reserveWithdrawal(db,{ownerId:alice,requestKey:'withdraw:alice:002',amount:'0.000001',destination:'USDT:TRC20:test-destination'}),/INSUFFICIENT_AVAILABLE_BALANCE/);
  const evidence={outcome:'confirmed' as const,providerReference:'provider:payout:event:001',settlementAccountId:pool};
  await assert.rejects(()=>settleWithdrawal(db,held.id,evidence),/WITHDRAWAL_NOT_SUBMITTED/);
  assert.equal((await submitWithdrawal(db,held.id)).state,'SUBMITTED');
  const paid=await settleWithdrawal(db,held.id,evidence);assert.equal(paid.state,'COMPLETED');assert.deepEqual(await settleWithdrawal(db,held.id,evidence),paid);
  assert.equal((await walletBalances(db,alice)).available,'0.000000');
  await assert.rejects(()=>settleWithdrawal(db,held.id,{...evidence,outcome:'rejected'}),/SETTLEMENT_CONFLICT/);
  await creditConfirmedDeposit(db,{...deposit,ownerId:bob,amount:'10.000001',requestKey:'deposit:bob:001',providerReference:'provider:network:event:log-2'});
  const before=await walletBalances(db,bob),failed=await reserveWithdrawal(db,{ownerId:bob,requestKey:'withdraw:bob:001',amount:'5',destination:'USDC:POLYGON:test-destination'});
  await submitWithdrawal(db,failed.id);assert.equal((await walletBalances(db,bob)).held,'5.000000');
  const rejection={outcome:'rejected' as const,providerReference:'provider:payout:rejected-002',settlementAccountId:pool};
  assert.equal((await settleWithdrawal(db,failed.id,rejection)).state,'FAILED');assert.deepEqual(await walletBalances(db,bob),before);
  assert.equal((await settleWithdrawal(db,failed.id,rejection)).state,'FAILED');
  const attempts=await Promise.allSettled([transferWallet(db,{ownerId:bob,recipientId:alice,amount:'40',requestKey:'transfer:race:001'}),transferWallet(db,{ownerId:bob,recipientId:alice,amount:'40',requestKey:'transfer:race:002'})]);
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal((await walletBalances(db,bob)).available,'20.000001');
  for(const bad of ['1e2','NaN','-1','0.0000001','1.'])assert.throws(()=>moneyMicros(bad));
  const {rows:imbalanced}=await pg.query('SELECT "transactionId" FROM "LedgerEntry" GROUP BY "transactionId" HAVING SUM(amount)<>0');assert.equal(imbalanced.length,0);
  const {rows:cache}=await pg.query('SELECT u.id FROM "User" u JOIN "LedgerAccount" a ON a."userId"=u.id WHERE u.balance<>a.balance');assert.equal(cache.length,0);
  assert.equal((await pg.query<{n:number}>('SELECT count(*)::int AS n FROM "LedgerEntry" e JOIN "WalletOperation" w ON w."transactionId"=e."transactionId" WHERE w.id=$1',[failed.id])).rows[0].n,0);
  console.log('Wallet engine: confirmed deposits, atomic send/receive, exact decimals, idempotency, reserved withdrawal protection, confirmed settlement, definitive rejection release, rollback and balanced journal passed. PGlite serializes transactions; separate-connection PostgreSQL contention testing remains required.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
