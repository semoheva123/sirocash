import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {scheduledDepositMonitor} from '../lib/scheduled-deposit-monitor';
import {depositOnlyForbiddenFlags} from '../lib/deposit-only-mode';
async function main(){
 const token='a'.repeat(64),fingerprint=createHash('sha256').update(token).digest('hex');
 const env={VERCEL_ENV:'production',SIRO_OUTBOX_WORKER_ENABLED:'true',SIRO_DEPOSIT_ONLY_ENABLED:'true'};
 let opened=0,calls=0,accepted=true,fail=false;
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:unknown[])=>{assert.equal(sql,'SELECT public.consume_deposit_monitor_ticket($1) AS accepted');assert.deepEqual(params,[fingerprint]);return {rows:[{accepted}]}}})};
 const build=(e=env)=>scheduledDepositMonitor({env:e,db:()=>{opened++;return db},batch:async()=>{calls++;if(fail)throw Error('private-response');return {state:'COMPLETED',healthy:true}}});
 const request=(auth='Bearer '+token)=>new Request('https://sirocash.vercel.app/api/internal/deposit-monitor-scheduled',{method:'POST',headers:{authorization:auth}});
 for(const auth of ['', 'Bearer short', 'Bearer '+'z'.repeat(64), 'Bearer '+token+'x'])assert.equal((await build()(request(auth))).status,401);
 assert.equal(opened,0);
 for(const flag of depositOnlyForbiddenFlags)assert.equal((await build({...env,[flag]:'true'})(request())).status,503);
 assert.equal((await build({...env,VERCEL_ENV:'preview'})(request())).status,503);assert.equal(opened,0);
 accepted=false;assert.equal((await build()(request())).status,401);assert.equal(calls,0);
 accepted=true;const ok=await build()(request());assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');assert.equal(calls,1);
 fail=true;const error=await build()(request());assert.equal(error.status,503);assert(!(await error.text()).includes('private-response'));
 const pg=new PGlite();try{
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');
  for(const d of (await readdir('prisma/migrations')).sort())if(!d.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${d}/migration.sql`,'utf8'));
  for(const role of ['anon','authenticated','sirocash_app','sirocash_financial_worker']){
   const {rows:[r]}=await pg.query<any>(`SELECT has_table_privilege($1,'"DepositMonitorTicket"','SELECT,INSERT,UPDATE,DELETE') AS exposed,has_table_privilege($1,'"DepositMonitorSchedule"','SELECT,INSERT,UPDATE,DELETE') AS config,has_function_privilege($1,'public.consume_deposit_monitor_ticket(text)','EXECUTE') AS consume`,[role]);
   assert.equal(r.exposed,false);assert.equal(r.config,false);assert.equal(r.consume,role==='sirocash_financial_worker');
  }
  await pg.query('INSERT INTO "DepositMonitorTicket" ("tokenHash","expiresAt") VALUES ($1,clock_timestamp()+interval \'2 minutes\')',[fingerprint]);
  const consume=async(hash=fingerprint)=>{await pg.exec('BEGIN;SET LOCAL ROLE sirocash_financial_worker');try{return (await pg.query<any>('SELECT public.consume_deposit_monitor_ticket($1) AS ok',[hash])).rows[0].ok}finally{await pg.exec('COMMIT')}};
  assert.equal(await consume(),false,'Disabled scheduler cannot authorize');
  await pg.exec('UPDATE "DepositMonitorSchedule" SET enabled=true');
  assert.equal(await consume('b'.repeat(64)),false);assert.equal(await consume(),true);assert.equal(await consume(),false,'No replay');
  await pg.query('INSERT INTO "DepositMonitorTicket" ("tokenHash","createdAt","expiresAt") VALUES ($1,clock_timestamp()-interval \'4 minutes\',clock_timestamp()-interval \'2 minutes\')',['c'.repeat(64)]);
  assert.equal(await consume('c'.repeat(64)),false,'Expired ticket rejected');
  assert.equal(await consume('bad'),false);
 }finally{await pg.close()}
 const ops=await readFile('ops/supabase-deposit-monitor.sql','utf8');
 assert(ops.includes("'*/2 * * * *'"));assert(ops.includes('175000'));assert(ops.includes('extensions.gen_random_bytes(32)'));
 assert(ops.includes('https://sirocash.vercel.app/api/internal/deposit-monitor-scheduled'));assert(!ops.includes('/api/internal/financial-worker'));
 assert(ops.includes('REVOKE ALL ON FUNCTION public.enqueue_deposit_monitor()'));
 console.log('DB scheduler PASS: single-use expiring hashed capabilities, disabled default, hosted grants/RLS isolation, replay/expiry rejection, no DB before deployment/isolation gates, fixed monitor-only composition and no secret/error leakage. Fixture DB only.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
