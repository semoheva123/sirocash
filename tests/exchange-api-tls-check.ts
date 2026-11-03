import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {PoolClient} from 'pg';
import {checkExchangeApiTlsOnce,safeTlsApiResult} from '../lib/exchange-api-tls-check';
async function main(){
 const pg=new PGlite();
 try{
  await pg.exec('CREATE ROLE sirocash_app;');
  for(const p of ['20261103200000_exchange_reference','20261103210000_exchange_diagnostics'])await pg.exec(await readFile(`prisma/migrations/${p}/migration.sql`,'utf8'));
  const db={query:async(sql:string,params?:unknown[])=>pg.query(sql.replaceAll('now()',"TIMESTAMPTZ '2026-11-03 21:00:00+00'"),params)} as unknown as Pick<PoolClient,'query'>;
  const seed=async()=>pg.exec(`DELETE FROM "ExchangeReference";INSERT INTO "ExchangeReference"(id,month,attempts,"lastOutcome","lastHttpStatus","lastIssues","blockedUntil") VALUES('sp-today','2026-11-01',6,'METHOD_CHECKS_COMPLETE',403,'{"experiment":"methods-20261103","complete":true}','infinity');`);
  const state=async()=>(await pg.query<{attempts:number;lastOutcome:string;lastIssues:{complete:boolean;check:{apiOk:boolean;result:string}};snapshot:unknown;pause:string}>('SELECT *,"blockedUntil"::text AS pause FROM "ExchangeReference"')).rows[0];
  let calls=0;
  const deps={db,key:'  TEST_KEY  ',now:()=>new Date('2026-11-03T21:00:00Z'),run:async(key:string)=>{calls++;assert.equal(key,'TEST_KEY');return {result:'CHALLENGED',status:403,format:'html',challenge:true,apiOk:false,rayId:'1234567890abcdef-IAD',body:'TEST_KEY',headers:{key:'TEST_KEY'},providerCode:'TEST_KEY'}}};
  await seed();await checkExchangeApiTlsOnce({...deps,key:undefined});assert.equal(calls,0);
  await Promise.all([checkExchangeApiTlsOnce(deps),checkExchangeApiTlsOnce(deps)]);
  assert.equal(calls,1);let r=await state();assert.equal(r.attempts,7);assert.equal(r.pause,'infinity');assert.equal(r.snapshot,null);assert.equal(r.lastOutcome,'API_TLS_COMPLETE');assert(r.lastIssues.complete);assert(!JSON.stringify(r).includes('TEST_KEY'));
  await checkExchangeApiTlsOnce(deps);assert.equal(calls,1,'Redeploy never re-arms');
  for(const update of [`attempts=7`,`attempts=93`,`month='2026-10-01'`,`"blockedUntil"='-infinity'`,`"lastOutcome"='API_TLS_RUNNING'`,`"lastHttpStatus"=200`,`"lastIssues"='{"experiment":"other","complete":true}'`,`"lastIssues"='{"experiment":"methods-20261103","complete":false}'`,`snapshot='{}'`]){
   await seed();await pg.exec(`UPDATE "ExchangeReference" SET ${update}`);await checkExchangeApiTlsOnce(deps);assert.equal(calls,1,update);
  }
  for(const result of ['API_JSON_SUCCESS','CLIENT_SETUP_UNAVAILABLE']){
   await seed();await checkExchangeApiTlsOnce({...deps,run:async()=>({result,status:result==='API_JSON_SUCCESS'?200:null,format:'json',apiOk:true})});
   r=await state();assert.equal(r.snapshot,null);assert.equal(r.pause,'infinity');assert.equal(r.attempts,7);
   assert.equal(r.lastIssues.check.apiOk,result==='API_JSON_SUCCESS');
  }
  await seed();await checkExchangeApiTlsOnce({...deps,run:async()=>{throw Error('TEST_KEY')}});r=await state();assert.equal(r.attempts,7);assert.equal(r.lastIssues.check.result,'CLIENT_RESULT_INVALID');assert(!JSON.stringify(r).includes('TEST_KEY'));
  assert.equal(safeTlsApiResult({result:'TEST_KEY',format:'TEST_KEY',apiOk:true,providerCode:'TEST_KEY',status:700,rayId:'TEST_KEY'}).apiOk,false);
  console.log('API TLS guard PASS: single durable reservation, no retries/re-arm, same pause/budget/cache, safe success/error/child output, concurrent and offline fixtures.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
