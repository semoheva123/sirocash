import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {PoolClient} from 'pg';
import {probeExchangeCurrenciesOnce} from '../lib/exchange-currencies-probe';
async function main(){
 const pg=new PGlite();
 try{
  await pg.exec('CREATE ROLE sirocash_app;');
  for(const path of ['20261103200000_exchange_reference','20261103210000_exchange_diagnostics'])await pg.exec(await readFile(`prisma/migrations/${path}/migration.sql`,'utf8'));
  // Fixed test-only clock; this operational experiment must not re-arm in future months.
  const db={query:async(sql:string,params?:unknown[])=>pg.query(sql.replaceAll('now()',"TIMESTAMPTZ '2026-11-03 18:00:00+00'"),params)} as unknown as Pick<PoolClient,'query'>;
  const seed=async()=>{
   await pg.exec(`DELETE FROM "ExchangeReference";INSERT INTO "ExchangeReference"(id,month,attempts,"lastHttpStatus","lastIssues","blockedUntil") VALUES('sp-today','2026-11-01',3,403,'{"challenge":true}','infinity');`);
  };
  let calls=0;
  const deps={db,key:'test-key',fetch:(async(url,options)=>{
   calls++;assert.equal(url,'https://api-v2.sp-today.com/api/v1/currencies?lang=en');
   assert.equal(options?.redirect,'error');assert.equal(options?.cache,'no-store');
   assert.equal(new Headers(options?.headers).get('x-api-key'),'test-key');
   return Response.json({ok:true,data:{currencies:[{code:'USD',privateExample:'DO_NOT_LOG'}]}});
  }) as typeof fetch};
  await seed();await probeExchangeCurrenciesOnce({...deps,key:undefined});assert.equal(calls,0);
  await Promise.all([probeExchangeCurrenciesOnce(deps),probeExchangeCurrenciesOnce(deps)]);assert.equal(calls,1);
  let row=(await pg.query<Record<string,unknown>>('SELECT *,"blockedUntil"::text AS pause FROM "ExchangeReference"')).rows[0];
  assert.equal(row.attempts,4);assert.equal(row.snapshot,null);assert.equal(row.pause,'infinity');
  assert.equal(row.lastOutcome,'CURRENCIES_JSON_OK');
  assert.deepEqual(row.lastIssues,{endpoint:'currencies',responseFormat:'json',challenge:false,currencyCount:1,hasUsd:true});
  assert(!JSON.stringify(row).includes('DO_NOT_LOG'));assert(!JSON.stringify(row).includes('test-key'));
  await probeExchangeCurrenciesOnce(deps);assert.equal(calls,1,'Redeploy must not repeat experiment');
  for(const update of [`attempts=93`,`month='2026-10-01'`,`"blockedUntil"=now()+interval '1 day'`,`"lastIssues"='{"challenge":false}'`,`"lastHttpStatus"=429`]){
   await seed();await pg.exec(`UPDATE "ExchangeReference" SET ${update}`);await probeExchangeCurrenciesOnce(deps);assert.equal(calls,1);
  }
  await seed();
  await probeExchangeCurrenciesOnce({...deps,fetch:(async()=>new Response('<html>private-key-DO-NOT-LOG</html>',{status:403,headers:{'content-type':'text/html','cf-mitigated':'challenge'}})) as typeof fetch});
  row=(await pg.query<Record<string,unknown>>('SELECT * FROM "ExchangeReference"')).rows[0];
  assert.equal(row.lastHttpStatus,403);assert.equal(row.lastOutcome,'CURRENCIES_HTTP');
  assert.deepEqual(row.lastIssues,{endpoint:'currencies',responseFormat:'html',challenge:true});
  assert(!JSON.stringify(row).includes('DO-NOT-LOG'));
  await seed();await probeExchangeCurrenciesOnce({...deps,fetch:(async()=>Response.json({ok:false,error:{code:'QUOTA_EXCEEDED',message:'SECRET'}},{status:429})) as typeof fetch});
  row=(await pg.query<Record<string,unknown>>('SELECT * FROM "ExchangeReference"')).rows[0];
  assert.equal((row.lastIssues as {providerCode:string}).providerCode,'QUOTA_EXCEEDED');assert(!JSON.stringify(row).includes('SECRET'));
  await seed();await probeExchangeCurrenciesOnce({...deps,fetch:(async()=>{throw Error('SECRET')}) as typeof fetch});
  row=(await pg.query<Record<string,unknown>>('SELECT * FROM "ExchangeReference"')).rows[0];
  assert.equal(row.attempts,4);assert.equal(row.lastOutcome,'CURRENCIES_NETWORK_OR_TIMEOUT');assert(!JSON.stringify(row).includes('SECRET'));
  console.log('Currencies experiment PASS: one concurrent durable claim, attempt 4 in existing cap, fixed authorization month, no quota reset/unpause/snapshot overwrite, explicit documented path, secret-free JSON/HTML/challenge/quota/network diagnostics. No live I/O.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
