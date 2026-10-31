import assert from 'node:assert/strict';
import {createReadSynchronizer,SessionExpired} from '../lib/read-synchronizer';
import {PGlite} from '@electric-sql/pglite';
import {readFinancialSnapshot} from '../lib/financial-status';
async function main(){
 let active=true,calls=0,resolve!:(n:number)=>void,fail=false,expired=false;
 const timers=new Map<number,{fn:()=>void;ms:number}>();let id=0;
 const states:string[]=[],values:number[]=[];
 const c=createReadSynchronizer({active:()=>active,read:async()=>{calls++;if(expired)throw new SessionExpired();if(fail)throw Error('offline');return new Promise<number>(r=>{resolve=r})},data:v=>values.push(v),state:s=>states.push(s),setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id as unknown as ReturnType<typeof setTimeout>},clearTimer:n=>{timers.delete(n as unknown as number)}});
 const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve()};
 const first=c.refresh();await flush();assert.equal(calls,1);
 const afterMutation=c.refresh();await flush();assert.equal(calls,1);resolve(1);await flush();assert.equal(calls,2);resolve(2);await Promise.all([first,afterMutation]);assert.deepEqual(values,[1,2]);
 assert([...timers.values()].some(t=>t.ms===5000));
 active=false;c.pause();assert.equal(timers.size,0);await c.refresh();assert.equal(calls,2);
 active=true;const pending=c.refresh();await flush();const oldResolve=resolve;c.pause();await pending;oldResolve(99);await flush();assert.deepEqual(values,[1,2]);
 fail=true;await assert.rejects(()=>c.refresh());assert.equal(states.at(-1),'retrying');assert([...timers.values()].some(t=>t.ms===10000));
 // Timeout when a transport ignores AbortSignal, followed by late result rejection.
 fail=false;const hung=c.refresh();await flush();const late=resolve;const timeout=[...timers.values()].find(t=>t.ms===8000)!;timeout.fn();await assert.rejects(()=>hung,/TIMEOUT/);late(100);await flush();assert.deepEqual(values,[1,2]);
 expired=true;await c.refresh();assert.equal(states.at(-1),'unauthenticated');assert.equal(timers.size,0);const before=calls;await c.refresh();assert.equal(calls,before);c.stop();
 const pg=new PGlite();try{
  await pg.exec(`CREATE TABLE "LedgerAccount"(id TEXT,"userId" UUID,"accountType" TEXT,currency TEXT,balance NUMERIC);CREATE TABLE "WalletOperation"(id TEXT,"ownerId" UUID,kind TEXT,amount NUMERIC,"feeAmount" NUMERIC,state TEXT,"createdAt" TIMESTAMPTZ);CREATE TABLE "Transaction"(id TEXT,type TEXT,status TEXT,"createdAt" TIMESTAMPTZ);CREATE TABLE "LedgerEntry"("accountId" TEXT,"transactionId" TEXT,amount NUMERIC);
  INSERT INTO "LedgerAccount" VALUES('a','00000000-0000-0000-0000-000000000001','USER','USD',100),('b','00000000-0000-0000-0000-000000000002','USER','USD',999);
  INSERT INTO "Transaction" VALUES('incoming','P2P','COMPLETED',now()),('foreign','DEPOSIT','COMPLETED',now());INSERT INTO "LedgerEntry" VALUES('a','incoming',100),('b','incoming',-101),('b','foreign',1000);`);
  const data=await readFinancialSnapshot({query:async(sql,params)=>({rows:(await pg.query(sql,params)).rows as Record<string,unknown>[]})},'00000000-0000-0000-0000-000000000001');
  assert.equal(data.balance.posted,'100');assert.equal(data.activity.length,1);assert.equal(data.activity[0].id,'incoming');assert.equal(data.activity[0].amount,'100');
 }finally{await pg.close()}
 console.log('Financial synchronization PASS: single flight, post-command freshness, pause/abort, stale-response exclusion, bounded timeout/backoff, terminal session expiry and incoming ledger activity isolation. No financial commands or live network.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
