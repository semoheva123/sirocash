import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFinancialSnapshot} from '../lib/financial-status';
async function main(){
 const pg=new PGlite();try{
  await pg.exec(`CREATE TABLE "LedgerAccount"(id TEXT,"userId" UUID,"accountType" TEXT,currency TEXT,balance NUMERIC);CREATE TABLE "WalletOperation"(id TEXT,"ownerId" UUID,kind TEXT,amount NUMERIC,"feeAmount" NUMERIC,state TEXT,"createdAt" TIMESTAMPTZ);CREATE TABLE "Transaction"(id TEXT,type TEXT,status TEXT,"createdAt" TIMESTAMPTZ);CREATE TABLE "UserDepositAddress"(id TEXT,"ownerId" UUID,network TEXT,address TEXT);CREATE TABLE "ChainDepositInbox"(id TEXT,"addressId" TEXT,network TEXT,"txId" TEXT,"amountBaseUnits" NUMERIC,state TEXT,"createdAt" TIMESTAMPTZ);CREATE TABLE "SignedWithdrawalOutbox"(id TEXT,"operationId" TEXT,network TEXT,"txId" TEXT,state TEXT,"createdAt" TIMESTAMPTZ,"signedPayload" TEXT);CREATE TABLE "LedgerEntry"("accountId" TEXT,"transactionId" TEXT,amount NUMERIC);
  INSERT INTO "LedgerAccount" VALUES('a','00000000-0000-0000-0000-000000000001','USER','USD',100),('b','00000000-0000-0000-0000-000000000002','USER','USD',999);
  INSERT INTO "Transaction" VALUES('incoming','P2P','COMPLETED',now()),('foreign','DEPOSIT','COMPLETED',now());INSERT INTO "LedgerEntry" VALUES('a','incoming',100),('b','incoming',-101),('b','foreign',1000);`);
  await pg.exec(`INSERT INTO "UserDepositAddress" VALUES ('aa','00000000-0000-0000-0000-000000000001','TRC20','alice-address'),('bb','00000000-0000-0000-0000-000000000002','TRC20','bob-address');
  INSERT INTO "ChainDepositInbox" VALUES ('da','aa','TRC20','alice-deposit',1234567,'AWAITING_VALUATION',now()),('db','bb','TRC20','bob-deposit',999999,'CREDITED',now());
  INSERT INTO "WalletOperation" VALUES ('wa','00000000-0000-0000-0000-000000000001','WITHDRAWAL',6,5,'RESERVED',now()),('wb','00000000-0000-0000-0000-000000000002','WITHDRAWAL',9,5,'SUBMITTED',now());
  INSERT INTO "SignedWithdrawalOutbox" VALUES ('pa','wa','TRC20','alice-payout','BROADCAST_UNKNOWN',now(),'SECRET-SIGNED-BYTES'),('pb','wb','TRC20','bob-payout','CONFIRMED',now(),'FOREIGN-SECRET');`);
  await pg.exec(`ALTER TABLE "WalletOperation" ADD COLUMN "transactionId" TEXT;
  ALTER TABLE "Transaction" ADD COLUMN "senderId" UUID,ADD COLUMN "receiverId" UUID;
  CREATE TABLE "ReceivingIdentity"("userId" UUID PRIMARY KEY,uid TEXT,"displayName" TEXT,username TEXT);
  INSERT INTO "ReceivingIdentity" VALUES('00000000-0000-0000-0000-000000000001','1234567897','Recipient name','recipient'),('00000000-0000-0000-0000-000000000002','9876543217','Sender name','sender');
  UPDATE "Transaction" SET "senderId"='00000000-0000-0000-0000-000000000002',"receiverId"='00000000-0000-0000-0000-000000000001';`);
  await pg.exec(`ALTER TABLE "ChainDepositInbox" ADD COLUMN sender TEXT;
  UPDATE "ChainDepositInbox" SET sender='alice-source' WHERE id='da';
  CREATE TABLE "UsdtWithdrawalQuote"("operationId" TEXT,"ownerId" UUID,network TEXT,recipient TEXT,"grossTokens" NUMERIC,"feeTokens" NUMERIC,"netTokens" NUMERIC);
  ALTER TABLE "SignedWithdrawalOutbox" ADD COLUMN sender TEXT,ADD COLUMN recipient TEXT,ADD COLUMN "amountBaseUnits" NUMERIC;
  UPDATE "SignedWithdrawalOutbox" SET sender='persisted-sender',recipient='persisted-recipient',"amountBaseUnits"=1000000;
  INSERT INTO "UsdtWithdrawalQuote" VALUES ('wa','00000000-0000-0000-0000-000000000001','TRC20','persisted-recipient',6,5,1);`);
  const data=await readFinancialSnapshot({query:async(sql,params)=>({rows:(await pg.query(sql,params)).rows as Record<string,unknown>[]})},'00000000-0000-0000-0000-000000000001');
  assert.equal(data.balance.posted,'100');assert.equal(data.balance.held,'6');
  assert.deepEqual(data.deposits.map(d=>d.txId),['alice-deposit']);assert.equal(data.deposits[0].state,'AWAITING_VALUATION');assert.equal(data.deposits[0].recipient,'alice-address');assert.equal(data.deposits[0].sender,'alice-source');
  assert.deepEqual(data.payouts.map(p=>p.txId),['alice-payout']);assert.equal(data.payouts[0].state,'BROADCAST_UNKNOWN');assert.equal(data.payouts[0].sender,'persisted-sender');assert.equal(data.payouts[0].recipient,'persisted-recipient');assert.equal(data.operations[0].feeTokens,'5');
  assert.deepEqual(data.addresses.map(a=>a.address),['alice-address']);assert(!JSON.stringify(data).includes('SECRET'));
  assert.equal(data.activity[0].senderName,'Sender name');assert.equal(data.activity[0].recipientName,'Recipient name');assert.equal(data.activity[0].recipientUid,'1234567897');
  const other=await readFinancialSnapshot({query:async(sql,params)=>({rows:(await pg.query(sql,params)).rows as Record<string,unknown>[]})},'00000000-0000-0000-0000-000000000002');
  assert.equal(other.activity.find(a=>a.id==='incoming')?.senderUid,'9876543217');
  assert.equal(other.activity.find(a=>a.id==='foreign')?.senderUid,null);
  const outsider=await readFinancialSnapshot({query:async(sql,params)=>({rows:(await pg.query(sql,params)).rows as Record<string,unknown>[]})},'00000000-0000-0000-0000-000000000003');
  assert.equal(outsider.activity.length,0);assert(!JSON.stringify(outsider).includes('Sender name'));
  assert.equal(data.activity.length,1);assert.equal(data.activity[0].id,'incoming');assert.equal(data.activity[0].amount,'100');
 }finally{await pg.close()}
 console.log('Financial synchronization PASS: incoming ledger activity and balance owner isolation. No financial commands or live network.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
