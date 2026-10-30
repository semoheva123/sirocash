import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();await db.exec(await readFile('prisma/migrations/20261030000000_ledger_invariants/migration.sql','utf8'));
await db.exec(await readFile('prisma/migrations/20261030010000_payment_services/migration.sql','utf8'));
await db.exec(await readFile('prisma/migrations/20261030020000_payment_service_constraints/migration.sql','utf8'));
await db.exec(await readFile('prisma/migrations/20261030030000_email_auth/migration.sql','utf8'));
const u='00000000-0000-0000-0000-000000000001', a='00000000-0000-0000-0000-000000000002',p='00000000-0000-0000-0000-000000000003',t='00000000-0000-0000-0000-000000000004';
await db.exec(`INSERT INTO "User" (id,phone,"pinHash") VALUES ('${u}','+905555555555','test-only'); INSERT INTO "LedgerAccount" (id,"userId","accountType") VALUES ('${a}','${u}','USER'); INSERT INTO "LedgerAccount" (id,"accountType") VALUES ('${p}','MASTER_POOL');`);
async function deposit(amount,other,status='COMPLETED',id=t){await db.transaction(async tx=>{await tx.exec(`INSERT INTO "Transaction" (id,"receiverId",amount,type,"idempotencyKey") VALUES ('${id}','${u}',${amount},'DEPOSIT','${id}'); INSERT INTO "LedgerEntry" (id,"transactionId","accountId",amount) VALUES (gen_random_uuid(),'${id}','${p}',-${amount}), (gen_random_uuid(),'${id}','${a}',${other}); UPDATE "Transaction" SET status='${status}' WHERE id='${id}';`)});}
await assert.rejects(()=>deposit(100,99));
await deposit(100,100);
const result=await db.query(`SELECT balance FROM "User" WHERE id='${u}'`);assert.equal(Number(result.rows[0].balance),100);
await assert.rejects(()=>db.exec(`UPDATE "LedgerEntry" SET amount=200`));
await assert.rejects(()=>db.exec(`DELETE FROM "LedgerEntry"`));
await assert.rejects(()=>db.exec(`UPDATE "LedgerAccount" SET balance=1000 WHERE id='${a}'`));
await assert.rejects(()=>db.exec(`UPDATE "User" SET balance=1000 WHERE id='${u}'`));
await assert.rejects(()=>db.exec(`UPDATE "Transaction" SET amount=200 WHERE id='${t}'`));
await assert.rejects(()=>db.exec(`INSERT INTO "Transaction" (id,"receiverId",amount,type,"idempotencyKey",status) VALUES (gen_random_uuid(),'${u}',5,'DEPOSIT','no-entries','COMPLETED')`));
await assert.rejects(()=>deposit(10,10,'FAILED','00000000-0000-0000-0000-000000000005'));
for(const type of ['SHAM_CASH','MOBILE_TOPUP']){
 const id=type==='SHAM_CASH'?'00000000-0000-0000-0000-000000000006':'00000000-0000-0000-0000-000000000007';
 await db.transaction(async tx=>{await tx.exec(`INSERT INTO "Transaction" (id,"senderId",amount,type,"idempotencyKey") VALUES ('${id}','${u}',5,'${type}','${type}'); INSERT INTO "LedgerEntry" (id,"transactionId","accountId",amount) VALUES (gen_random_uuid(),'${id}','${a}',-5),(gen_random_uuid(),'${id}','${p}',5); UPDATE "Transaction" SET status='COMPLETED' WHERE id='${id}';`)});
}
assert.equal(Number((await db.query(`SELECT balance FROM "User" WHERE id='${u}'`)).rows[0].balance),90);
await db.close();console.log('Ledger tests passed: balanced posting, rollback, cache synchronization, immutability, direct balance guards, completed/failed constraints.');
