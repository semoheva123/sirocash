import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {runFinancialWorkerBatch} from '../lib/financial-worker';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){const pg=new PGlite();try{
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
 for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
 // Isolated queue views exercise scheduler SQL without creating accounts, funded operations or keys.
 await pg.exec(`ALTER TABLE "SignedWithdrawalOutbox" RENAME TO "FixturePayouts"; ALTER TABLE "SignedSweepOutbox" RENAME TO "FixtureSweeps";
 CREATE TABLE "SignedWithdrawalOutbox"(id UUID,state TEXT,"createdAt" TIMESTAMP(3),"quoteId" UUID); CREATE TABLE "SignedSweepOutbox"(id UUID,state TEXT,"createdAt" TIMESTAMP(3),"addressId" UUID);
 INSERT INTO "SignedWithdrawalOutbox"(id,state,"createdAt") VALUES('00000000-0000-0000-0000-000000000001','BROADCAST_UNKNOWN','2026-01-01');
 INSERT INTO "SignedSweepOutbox"(id,state,"createdAt") VALUES('00000000-0000-0000-0000-000000000002','SIGNED','2026-01-02');`);
 const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
 const seen:string[]=[];const process=async(job:{id:string})=>{seen.push(job.id);throw new Error('unresolved fixture')};
 await assert.rejects(()=>runFinancialWorkerBatch(db,{process}),/DISABLED/);
 assert.equal((await runFinancialWorkerBatch(db,{enabled:true,limit:1,process})).processed,1);
 assert.equal((await runFinancialWorkerBatch(db,{enabled:true,limit:1,process})).processed,1);
 assert.ok(seen[0].endsWith('1'));assert.ok(seen[1].endsWith('2'));
 assert.equal((await runFinancialWorkerBatch(db,{enabled:true,limit:1,process})).processed,0); // End resets cursor.
 assert.equal((await runFinancialWorkerBatch(db,{enabled:true,limit:1,process})).processed,1);assert.equal(seen[2],seen[0]);
 await pg.exec(`UPDATE "FinancialWorkerLease" SET "claimId"='00000000-0000-0000-0000-000000000099',"expiresAt"=now()+interval '1 minute'`);
 assert.equal((await runFinancialWorkerBatch(db,{enabled:true,process})).state,'BUSY');
 await pg.exec(`UPDATE "FinancialWorkerLease" SET "expiresAt"=now()-interval '1 second'`);
 assert.equal((await runFinancialWorkerBatch(db,{enabled:true,limit:1,process})).processed,1);
 await pg.exec('UPDATE "FinancialWorkerLease" SET "cursorTime"=NULL,"cursorId"=NULL,"cursorKind"=NULL');
 const timeout=await runFinancialWorkerBatch(db,{enabled:true,limit:1,jobTimeoutMs:100,process:async(_job,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))});assert.equal(timeout.held,1);
 await pg.exec(`ALTER TABLE "EnergyRentalIntent" RENAME TO "FixtureEnergyIntents"; CREATE TABLE "EnergyRentalIntent"(id UUID,state TEXT,"createdAt" TIMESTAMP(3)); INSERT INTO "EnergyRentalIntent" VALUES('00000000-0000-0000-0000-000000000003','UNCERTAIN','2027-01-01')`);
 const kinds:string[]=[];await runFinancialWorkerBatch(db,{enabled:true,process:async job=>{kinds.push(job.kind);return {state:'HELD'}}});assert.ok(kinds.includes('ENERGY'));
 // Deposit-only scheduling must never dispatch even saved payouts/sweeps/energy.
 await pg.exec('UPDATE "FinancialWorkerLease" SET "cursorTime"=NULL,"cursorId"=NULL,"cursorKind"=NULL');
 let forbiddenCalls=0;
 const depositsOnly=await runFinancialWorkerBatch(db,{enabled:true,depositOnly:true,process:async()=>{forbiddenCalls++}});
 assert.equal(depositsOnly.processed,0);assert.equal(forbiddenCalls,0);
 // Lease theft/expiry fences cursor writes and cleanup must not release another worker's lease.
 await assert.rejects(()=>runFinancialWorkerBatch(db,{enabled:true,limit:1,process:async()=>{await pg.exec(`UPDATE "FinancialWorkerLease" SET "claimId"='00000000-0000-0000-0000-000000000098'`)}}),/LEASE_LOST/);
 assert.ok((await pg.query<{claimId:string}>('SELECT "claimId" FROM "FinancialWorkerLease"')).rows[0].claimId.endsWith('98'));
 console.log('Financial worker: durable fair cursor/restart, held-item progress, exclusive lease, expiration recovery, deadline and fenced cleanup passed. No financial actions.');
}finally{await pg.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
