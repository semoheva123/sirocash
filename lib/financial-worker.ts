import 'server-only';
import {randomUUID} from 'node:crypto';
import type {WalletDb} from './wallet-engine';
export type FinancialJob={id:string;kind:'ENERGY'|'PAYOUT'|'SWEEP'|'GAS'|'PREPARE_PAYOUT'|'PREPARE_SWEEP'|'DEPOSIT_VALUE';createdAt:string};
/** Durable fair keyset scan with a fenced lease. Not a timer and never grants finance authority.
 * Every processor must use durable per-operation dispatch claims and replay-safe settlement.
 * HELD/error jobs advance the cursor and are revisited next scan, so they cannot starve others.
 */
export async function runFinancialWorkerBatch(db:WalletDb,options:{enabled?:boolean;process:(job:FinancialJob,signal:AbortSignal)=>Promise<unknown>;limit?:number;jobTimeoutMs?:number}){
 if(options.enabled!==true)throw new Error('FINANCIAL_WORKER_DISABLED');
 const limit=options.limit??5,timeout=options.jobTimeoutMs??30000;
 if(!Number.isSafeInteger(limit)||limit<1||limit>5||!Number.isSafeInteger(timeout)||timeout<100||timeout>30000)throw new Error('FINANCIAL_WORKER_INPUT');
 const owner=randomUUID(),deadline=Date.now()+120000;
 const acquired=await db.transaction(async tx=>{
  const {rows}=await tx.query('UPDATE "FinancialWorkerLease" SET "claimId"=$1,"expiresAt"=clock_timestamp()+interval \'5 minutes\' WHERE id=\'outbox\' AND ("expiresAt" IS NULL OR "expiresAt"<=clock_timestamp()) RETURNING id',[owner]);return rows.length===1;
 });
 if(!acquired)return {state:'BUSY',processed:0,held:0};
 let processed=0,held=0;
 try{
  for(let i=0;i<limit&&Date.now()<deadline;i++){
   const job=await db.transaction(async tx=>{
    const {rows:[lease]}=await tx.query('SELECT *,"expiresAt">clock_timestamp() AS fresh FROM "FinancialWorkerLease" WHERE id=\'outbox\' AND "claimId"=$1 FOR UPDATE',[owner]);
    if(!lease||lease.fresh!==true)throw new Error('FINANCIAL_WORKER_LEASE_LOST');
    const {rows:[row]}=await tx.query(`SELECT * FROM (SELECT id,'PAYOUT'::text AS kind,"createdAt" FROM "SignedWithdrawalOutbox" WHERE state IN ('SIGNED','BROADCAST_UNKNOWN') UNION ALL SELECT id,'SWEEP'::text AS kind,"createdAt" FROM "SignedSweepOutbox" WHERE state IN ('SIGNED','BROADCAST_UNKNOWN') UNION ALL SELECT id,'ENERGY'::text AS kind,"createdAt" FROM "EnergyRentalIntent" WHERE state IN ('PREPARED','UNCERTAIN') UNION ALL SELECT id,'GAS'::text AS kind,"createdAt" FROM "NativeGasOutbox" WHERE state<>'CONFIRMED' UNION ALL SELECT q.id,'PREPARE_PAYOUT'::text AS kind,q."createdAt" FROM "UsdtWithdrawalQuote" q JOIN "WalletOperation" o ON o.id=q."operationId" WHERE o.state='RESERVED' AND NOT EXISTS(SELECT 1 FROM "SignedWithdrawalOutbox" p WHERE p."quoteId"=q.id) UNION ALL SELECT id,'DEPOSIT_VALUE'::text AS kind,"createdAt" FROM "ChainDepositInbox" WHERE state='AWAITING_VALUATION' UNION ALL SELECT a.id,'PREPARE_SWEEP'::text AS kind,a."createdAt" FROM "UserDepositAddress" a JOIN "DepositAddressVault" v ON v.id=a."vaultId" WHERE v.enabled AND v."originVerified" AND NOT EXISTS(SELECT 1 FROM "SignedSweepOutbox" s WHERE s."addressId"=a.id AND s.state IN ('SIGNED','BROADCAST_UNKNOWN'))) q WHERE $1::timestamp IS NULL OR ("createdAt",id,kind)>($1::timestamp,$2::uuid,$3::text) ORDER BY "createdAt",id,kind LIMIT 1`,[lease.cursorTime,lease.cursorId,lease.cursorKind]);
    if(!row){await tx.query('UPDATE "FinancialWorkerLease" SET "cursorTime"=NULL,"cursorId"=NULL,"cursorKind"=NULL WHERE id=\'outbox\' AND "claimId"=$1',[owner]);return null}
    return {id:String(row.id),kind:row.kind as FinancialJob['kind'],createdAt:row.createdAt instanceof Date?row.createdAt.toISOString():String(row.createdAt)};
   });
   if(!job||Date.now()>=deadline)break;
   const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
   try{const result=await Promise.race([options.process(job,abort.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error())},Math.min(timeout,Math.max(1,deadline-Date.now())))})]);if(result&&typeof result==='object'&&'state' in result&&result.state==='HELD')held++}
   catch{held++}finally{if(timer)clearTimeout(timer);abort.abort()}
   await db.transaction(async tx=>{
    const {rows}=await tx.query('UPDATE "FinancialWorkerLease" SET "cursorTime"=$2,"cursorId"=$3,"cursorKind"=$4 WHERE id=\'outbox\' AND "claimId"=$1 AND "expiresAt">clock_timestamp() RETURNING id',[owner,job.createdAt,job.id,job.kind]);
    if(rows.length!==1)throw new Error('FINANCIAL_WORKER_LEASE_LOST');
   });processed++;
  }
  return {state:'COMPLETED',processed,held};
 }finally{await db.transaction(tx=>tx.query('UPDATE "FinancialWorkerLease" SET "claimId"=NULL,"expiresAt"=NULL WHERE id=\'outbox\' AND "claimId"=$1',[owner]))}
}
