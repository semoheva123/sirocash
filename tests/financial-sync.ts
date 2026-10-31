import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFinancialSnapshot} from '../lib/financial-status';
async function main(){
 const pg=new PGlite();try{
  await pg.exec(`CREATE TABLE "LedgerAccount"(id TEXT,"userId" UUID,"accountType" TEXT,currency TEXT,balance NUMERIC);CREATE TABLE "WalletOperation"(id TEXT,"ownerId" UUID,kind TEXT,amount NUMERIC,"feeAmount" NUMERIC,state TEXT,"createdAt" TIMESTAMPTZ);CREATE TABLE "Transaction"(id TEXT,type TEXT,status TEXT,"createdAt" TIMESTAMPTZ);CREATE TABLE "LedgerEntry"("accountId" TEXT,"transactionId" TEXT,amount NUMERIC);
  INSERT INTO "LedgerAccount" VALUES('a','00000000-0000-0000-0000-000000000001','USER','USD',100),('b','00000000-0000-0000-0000-000000000002','USER','USD',999);
  INSERT INTO "Transaction" VALUES('incoming','P2P','COMPLETED',now()),('foreign','DEPOSIT','COMPLETED',now());INSERT INTO "LedgerEntry" VALUES('a','incoming',100),('b','incoming',-101),('b','foreign',1000);`);
  const data=await readFinancialSnapshot({query:async(sql,params)=>({rows:(await pg.query(sql,params)).rows as Record<string,unknown>[]})},'00000000-0000-0000-0000-000000000001');
  assert.equal(data.balance.posted,'100');assert.equal(data.activity.length,1);assert.equal(data.activity[0].id,'incoming');assert.equal(data.activity[0].amount,'100');
 }finally{await pg.close()}
 console.log('Financial synchronization PASS: incoming ledger activity and balance owner isolation. No financial commands or live network.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
