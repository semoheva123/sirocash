import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {PoolClient} from 'pg';
import {checkExchangeMethodsOnce} from '../lib/exchange-method-checks';
async function main(){
 const pg=new PGlite();
 try{
  await pg.exec('CREATE ROLE sirocash_app;');
  for(const path of ['20261103200000_exchange_reference','20261103210000_exchange_diagnostics'])await pg.exec(await readFile(`prisma/migrations/${path}/migration.sql`,'utf8'));
  const db={query:async(sql:string,params?:unknown[])=>pg.query(sql.replaceAll('now()',"TIMESTAMPTZ '2026-11-03 18:00:00+00'"),params)} as unknown as Pick<PoolClient,'query'>;
  const seed=async()=>pg.exec(`DELETE FROM "ExchangeReference";INSERT INTO "ExchangeReference"(id,month,attempts,"lastOutcome","lastHttpStatus","lastIssues","blockedUntil") VALUES('sp-today','2026-11-01',4,'CURRENCIES_HTTP',403,'{"endpoint":"currencies","challenge":true}','infinity');`);
  const state=async()=>(await pg.query<{attempts:number;lastIssues:{complete:boolean;checks:{name:string;challenge:boolean;rayId:string|null;providerCode:string;apiOk:boolean}[]};snapshot:unknown;pause:string}>('SELECT *,"blockedUntil"::text AS pause FROM "ExchangeReference"')).rows[0];
  let calls=0;
  const deps={db,key:'  TEST_SECRET  ',now:()=>new Date('2026-11-03T18:00:00Z'),fetch:(async(url,options)=>{
   calls++;assert.equal(url,'https://api-v2.sp-today.com/api/v1/currency/usd?lang=en');
   assert.equal(options?.redirect,'error');assert.equal(options?.cache,'no-store');
   const headers=new Headers(options?.headers);
   assert(!headers.has('origin'));assert(!headers.has('referer'));
   assert.equal(headers.get('x-api-key'),calls===1?'TEST_SECRET':null);
   return new Response('<html>TEST_SECRET private challenge payload</html>',{status:403,headers:{'content-type':'text/html','cf-mitigated':'challenge','cf-ray':'1234567890abcdef-IAD'}});
  }) as typeof fetch};
  await seed();await checkExchangeMethodsOnce({...deps,key:undefined});assert.equal(calls,0);
  await Promise.all([checkExchangeMethodsOnce(deps),checkExchangeMethodsOnce(deps)]);
  assert.equal(calls,2);let row=await state();assert.equal(row.attempts,6);assert.equal(row.pause,'infinity');assert.equal(row.snapshot,null);
  assert.equal(row.lastIssues.complete,true);assert.equal(row.lastIssues.checks.length,2);
  assert(row.lastIssues.checks.every(check=>check.challenge));assert.equal(row.lastIssues.checks[0].rayId,'1234567890abcdef-IAD');
  assert(!JSON.stringify(row).includes('TEST_SECRET'));assert(!JSON.stringify(row).includes('private challenge'));
  await checkExchangeMethodsOnce(deps);assert.equal(calls,2,'Redeploy cannot re-arm');
  for(const update of [`attempts=93`,`month='2026-10-01'`,`"blockedUntil"=now()+interval '1 day'`,`"lastIssues"='{"challenge":false}'`,`"lastOutcome"='QUOTA'`]){
   await seed();await pg.exec(`UPDATE "ExchangeReference" SET ${update}`);await checkExchangeMethodsOnce(deps);assert.equal(calls,2);
  }
  await seed();let n=0;
  await checkExchangeMethodsOnce({...deps,fetch:(async(url,options)=>{
   n++;const headers=new Headers(options?.headers);
   if(n===2){assert.equal(headers.get('x-api-key'),null);return Response.json({ok:false,error:{code:'MISSING_API_KEY',message:'TEST_SECRET'}},{status:401})}
   assert.equal(headers.get('x-api-key'),'TEST_SECRET');
   assert.equal(url,n===1?'https://api-v2.sp-today.com/api/v1/currency/usd?lang=en':'https://api-v2.sp-today.com/api/v1/currencies?lang=en');
   return Response.json({ok:true,data:{currency:{code:'USD',private:'TEST_SECRET'}}});
  }) as typeof fetch});
  assert.equal(n,3);row=await state();assert.equal(row.attempts,7);assert.equal(row.snapshot,null);assert.equal(row.pause,'infinity');
  assert.equal(row.lastIssues.checks[1].providerCode,'MISSING_API_KEY');assert.equal(row.lastIssues.checks[2].name,'currencies-minimal');assert(!JSON.stringify(row).includes('TEST_SECRET'));
  await seed();n=0;
  await checkExchangeMethodsOnce({...deps,fetch:(async()=>{n++;return Response.json({ok:false,error:{code:'INVALID_API_KEY',message:'TEST_SECRET'}},{status:401})}) as typeof fetch});
  assert.equal(n,2,'No extra authenticated requests after rejection');row=await state();assert.equal(row.lastIssues.checks[0].providerCode,'INVALID_API_KEY');
  await seed();n=0;
  await checkExchangeMethodsOnce({...deps,fetch:(async()=>{n++;throw Error('TEST_SECRET')}) as typeof fetch});
  assert.equal(n,2);row=await state();assert.equal(row.attempts,6);assert(!JSON.stringify(row).includes('TEST_SECRET'));
  console.log('Method comparison PASS: one durable batch, exactly 2 comparisons/at most 3 calls, authenticated vs credential-free headers, stop after challenge/rejection, no retries, fixed month, existing quota/pause/snapshot preserved, sanitized Ray IDs/JSON/errors, no secret leakage or live I/O.');
 }finally{await pg.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
