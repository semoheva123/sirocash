import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {TronWeb} from 'tronweb';
import {recoverIntentEnergy} from '../lib/energy-recovery';
import {purchaseIntentEnergy} from '../lib/energy-purchase';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){
 const pg=new PGlite();try{
 await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE sirocash_app;
 ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated;
 CREATE TABLE "FinancialWorkerLease"("cursorKind" TEXT CHECK("cursorKind" IN ('PAYOUT','SWEEP')));
 CREATE TABLE "WalletOperation"(id UUID PRIMARY KEY,state TEXT,kind TEXT);
 CREATE TABLE "UserDepositAddress"(id UUID PRIMARY KEY,"vaultId" INTEGER,network TEXT,address TEXT);
 CREATE TABLE "DepositAddressVault"(id INTEGER PRIMARY KEY,enabled BOOLEAN,"originVerified" BOOLEAN);
 CREATE TABLE "PayoutExpensePolicy"(network TEXT PRIMARY KEY,enabled BOOLEAN,"perPayoutCap" NUMERIC,"dailyCap" NUMERIC);
 INSERT INTO "PayoutExpensePolicy" VALUES('TRC20',false,0,0);
 CREATE TABLE "PayoutExpenseReservation"(network TEXT,"amountBaseUnits" NUMERIC,state TEXT,"settledAt" TIMESTAMPTZ);
 CREATE TABLE "SweepDispatchAuthorization"(network TEXT,expense NUMERIC,state TEXT,"settledAt" TIMESTAMPTZ);
 CREATE TABLE "NativeGasOutbox"(expense NUMERIC,state TEXT,"confirmedAt" TIMESTAMPTZ);
 CREATE TABLE "SignedSweepOutbox"(id UUID,"addressId" UUID,state TEXT);`);
 for(const m of ['20261031020000_energy_intents','20261031170000_unified_tron_energy','20261031200000_energy_purchase_budget','20261031220000_energy_delivery_recovery'])await pg.exec(await readFile(`prisma/migrations/${m}/migration.sql`,'utf8'));
 await pg.exec('ALTER TABLE "EnergyRentalIntent" ADD COLUMN "bandwidthAmount" INTEGER NOT NULL DEFAULT 0; ALTER TABLE "EnergyPurchaseAttempt" ADD COLUMN "bandwidthAmount" INTEGER NOT NULL DEFAULT 0;');
 const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
 const id=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
 const sender=String(TronWeb.address.fromPrivateKey('1'.padStart(64,'0')));
 const address=(n:number)=>n===1?sender:String(TronWeb.address.fromPrivateKey(n.toString(16).padStart(64,'0')));
 await pg.exec(`INSERT INTO "DepositAddressVault" VALUES(1,true,true)`);
 for(let n=1;n<=5;n++){
 await pg.query('INSERT INTO "UserDepositAddress" VALUES($1,1,\'TRC20\',$2)',[id(n+10),sender]);
 // Distinct synthetic senders avoid unrelated sender-pending uniqueness.
 const s=address(n);
 await pg.query('UPDATE "UserDepositAddress" SET address=$2 WHERE id=$1',[id(n+10),s]);
 await pg.query('INSERT INTO "EnergyRentalIntent"(id,"sweepAddressId","senderAddress","recipientAddress","amountBaseUnits","requestKey",fingerprint,"energyAmount","durationMinutes","maxRentalSun") VALUES($1,$2,$3,\'TFMUACLuYyFcw9YzrAgESnQ9a6pvEiY1bL\',10,$4,\'fixture\',65000,60,100)',[id(n),id(n+10),s,'fixture:'+n]);
 }
 let calls=0;
 const quote=(n=1)=>({sender:address(n),energyAmount:65000,durationMinutes:60 as const,costSun:50n,expiresAt:Date.now()+50000,intentFingerprint:'fixture'});
 const options={enabled:true,send:async()=>{calls++;return {orderId:'order-1'}}};
 await assert.rejects(()=>purchaseIntentEnergy(db,id(1),quote(),{...options,enabled:false}),/DISABLED/);
 await assert.rejects(()=>purchaseIntentEnergy(db,id(1),quote(),options),/POLICY_DISABLED/);
 await pg.exec('UPDATE "PayoutExpensePolicy" SET enabled=true,"perPayoutCap"=10000,"dailyCap"=10000 WHERE network=\'TRC20\'');
 await pg.exec('UPDATE "EnergyPurchasePolicy" SET enabled=true,"perOrderSun"=100,"totalHeldSun"=100');
 await assert.rejects(()=>purchaseIntentEnergy(db,id(1),{...quote(),sender:'wrong'},options),/BINDING_FAILED/);
 await assert.rejects(()=>purchaseIntentEnergy(db,id(1),{...quote(),expiresAt:Date.now()-1},options),/STALE/);
 await assert.rejects(()=>purchaseIntentEnergy(db,id(1),{...quote(),costSun:101n},options),/ORDER_BUDGET/);
 await pg.exec('UPDATE "DepositAddressVault" SET enabled=false');
 await assert.rejects(()=>purchaseIntentEnergy(db,id(1),quote(),options),/SWEEP_NOT_READY/);
 await pg.exec('UPDATE "DepositAddressVault" SET enabled=true');
 await pg.query('INSERT INTO "SignedSweepOutbox" VALUES($1,$2,\'SIGNED\')',[id(99),id(11)]);
 await assert.rejects(()=>purchaseIntentEnergy(db,id(1),quote(),options),/SWEEP_NOT_READY/);
 await pg.exec('DELETE FROM "SignedSweepOutbox"');
 // Failure after reservation INSERT must roll back both reservation and intent state.
 const failing:WalletDb={transaction:run=>db.transaction(tx=>run({query:async(sql,params)=>{
  if(sql.startsWith('UPDATE "EnergyRentalIntent"'))throw new Error('SIMULATED_COMMIT_STAGE_FAILURE');
  return tx.query(sql,params);
 }}))};
 await assert.rejects(()=>purchaseIntentEnergy(failing,id(1),quote(),options),/SIMULATED_COMMIT/);
 assert.equal((await pg.query<{n:number}>('SELECT count(*)::int AS n FROM "EnergyPurchaseAttempt"')).rows[0].n,0);
 assert.equal(calls,0);
 await pg.exec(`INSERT INTO "PayoutExpenseReservation" VALUES('TRC20',50,'HELD',NULL); UPDATE "PayoutExpensePolicy" SET "dailyCap"=99 WHERE network='TRC20'`);
 await assert.rejects(()=>purchaseIntentEnergy(db,id(1),quote(),options),/NETWORK_DAILY_CAP/);assert.equal(calls,0);
 await pg.exec('DELETE FROM "PayoutExpenseReservation"');
 // Provider purchases cannot spend from a second independent budget before dispatch.
 await pg.exec('UPDATE "PayoutExpensePolicy" SET "dailyCap"=49 WHERE network=\'TRC20\'');
 await assert.rejects(()=>purchaseIntentEnergy(db,id(1),quote(),options),/NETWORK_DAILY_CAP/);assert.equal(calls,0);
 await pg.exec('UPDATE "PayoutExpensePolicy" SET "dailyCap"=10000 WHERE network=\'TRC20\'');
 assert.equal((await purchaseIntentEnergy(db,id(1),quote(),options)).state,'ACKNOWLEDGED');
 assert.equal((await purchaseIntentEnergy(db,id(1),quote(),options)).state,'ACKNOWLEDGED');assert.equal(calls,1);
 await pg.exec('UPDATE "PayoutExpensePolicy" SET "dailyCap"=99 WHERE network=\'TRC20\'');
 await assert.rejects(()=>purchaseIntentEnergy(db,id(2),quote(2),options),/NETWORK_DAILY_CAP/);assert.equal(calls,1);
 await pg.exec('UPDATE "PayoutExpensePolicy" SET "dailyCap"=10000 WHERE network=\'TRC20\'');
 assert.equal((await purchaseIntentEnergy(db,id(2),quote(2),{enabled:true,send:async()=>{calls++;throw new Error('secret upstream body')}})).state,'UNKNOWN');
 assert.equal((await purchaseIntentEnergy(db,id(2),quote(2),options)).state,'UNKNOWN');assert.equal(calls,2);
 await assert.rejects(()=>purchaseIntentEnergy(db,id(3),quote(3),options),/TOTAL_BUDGET/);assert.equal(calls,2);
 await assert.rejects(()=>pg.exec('UPDATE "EnergyPurchaseAttempt" SET "costSun"=1'),/IMMUTABLE/);
 await assert.rejects(()=>pg.exec('DELETE FROM "EnergyPurchaseAttempt"'),/IMMUTABLE/);
 await pg.exec('UPDATE "EnergyPurchasePolicy" SET "totalHeldSun"=200');
 assert.equal((await purchaseIntentEnergy(db,id(3),quote(3),{enabled:true,timeoutMs:100,send:async()=>new Promise(()=>{})})).state,'UNKNOWN');
 assert.equal((await purchaseIntentEnergy(db,id(4),quote(4),{enabled:true,send:async()=>({orderId:'invalid\nsecret'})})).state,'UNKNOWN');
 await assert.rejects(()=>purchaseIntentEnergy(db,id(5),quote(5),options),/TOTAL_BUDGET/);
 // The same shared budget also covers operating-wallet withdrawals.
 await pg.exec('UPDATE "EnergyPurchasePolicy" SET "totalHeldSun"=300');
 await pg.query('INSERT INTO "WalletOperation" VALUES($1,\'FAILED\',\'WITHDRAWAL\')',[id(50)]);
 const operating='TFMUACLuYyFcw9YzrAgESnQ9a6pvEiY1bL';
 await pg.query('INSERT INTO "EnergyRentalIntent"(id,"withdrawalId","senderAddress","recipientAddress","amountBaseUnits","requestKey",fingerprint,"energyAmount","durationMinutes","maxRentalSun") VALUES($1,$2,$3,$4,10,\'payout:fixture\',\'fixture\',65000,60,100)',[id(6),id(50),operating,sender]);
 const pq={...quote(),sender:operating};
 await assert.rejects(()=>purchaseIntentEnergy(db,id(6),pq,options),/PAYOUT_NOT_RESERVED/);
 await pg.exec('UPDATE "WalletOperation" SET state=\'RESERVED\'');
 assert.equal((await purchaseIntentEnergy(db,id(6),pq,{enabled:true,send:async()=>({orderId:'payout-order'})})).state,'ACKNOWLEDGED');
 for(const table of ['EnergyPurchasePolicy','EnergyPurchaseAttempt']){
 const {rows:[r]}=await pg.query<{relrowsecurity:boolean;api:boolean;runtime:boolean}>(`SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') AS api,has_table_privilege('sirocash_app',oid,'SELECT,INSERT,UPDATE,DELETE') AS runtime FROM pg_class WHERE oid=$1::regclass`,['"'+table+'"']);
 assert.equal(r.relrowsecurity,true);assert.equal(r.api,false);assert.equal(r.runtime,false);
 }
 const purchaseCallsBeforeRecovery=calls;
 const signal=new AbortController().signal,delegationTxId='ab'.repeat(32);
 const receipt={orderId:'order-1',status:'success' as const,actualCostSun:40n,priceExceeded:false,delegationTxId};
 const proof=()=>({sender:address(1),delegationTxId,energyAmount:65000,observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+25000).toISOString()});
 const recovery={signal,check:async()=>receipt,observe:async()=>proof()};
 assert.equal((await recoverIntentEnergy(db,id(1),{...recovery,check:async()=>{throw Error('not found')}})).state,'HELD');
 assert.equal((await recoverIntentEnergy(db,id(1),{...recovery,observe:async()=>{throw Error('not delivered')}})).state,'HELD');
 assert.equal((await pg.query<{state:string}>('SELECT state FROM "EnergyRentalIntent" WHERE id=$1',[id(1)])).rows[0].state,'UNCERTAIN');
 assert.equal((await recoverIntentEnergy(db,id(1),recovery)).state,'DELIVERED');
 assert.equal((await pg.query<{state:string}>('SELECT state FROM "EnergyRentalIntent" WHERE id=$1',[id(1)])).rows[0].state,'DELIVERED');
 await assert.rejects(()=>recoverIntentEnergy(db,id(1),{...recovery,check:async()=>({...receipt,actualCostSun:41n})}),/RECEIPT_CHANGED/);
 await assert.rejects(()=>pg.exec('UPDATE "EnergyPurchaseAttempt" SET "actualCostSun"=1 WHERE "actualCostSun" IS NOT NULL'),/IMMUTABLE/);
 const breach=await recoverIntentEnergy(db,id(2),{...recovery,check:async()=>({...receipt,orderId:'order-2',actualCostSun:150n,priceExceeded:true})});
 assert.equal(breach.state,'HELD');assert.equal((await pg.query<{enabled:boolean}>('SELECT enabled FROM "EnergyPurchasePolicy"')).rows[0].enabled,false);
 assert.equal((await pg.query<{state:string}>('SELECT state FROM "EnergyRentalIntent" WHERE id=$1',[id(2)])).rows[0].state,'UNCERTAIN');
 assert.equal(calls,purchaseCallsBeforeRecovery); // Recovery has no purchase capability.
 console.log('Energy purchase: pre-order shared budget, exact/fresh binding, disabled gates, immutable durable claims, timeout/unknown no resend, API isolation passed. No provider calls.');
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
