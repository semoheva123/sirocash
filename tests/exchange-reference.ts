import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {PoolClient} from 'pg';
import {exchangeAge,parseExchangeOverview} from '../lib/exchange-reference';
import {claimExchangeAttempt,loadExchangeReference,blockExhaustedExchange} from '../lib/exchange-reference-store';
import {GET} from '../app/api/exchange-rates/route';
async function main(){
 const now=new Date(),at=now.toISOString();
 const raw={ok:true,data:{cities:[],rates:[{code:'USD',cities:{damascus:{buy:145,sell:146,change:0.35}},updated_at:at}],global_fx:[{pair:'EUR/USD',rate:1.0856},{pair:'USD/TRY',rate:34.52}],updated_at:at}};
 const snapshot=parseExchangeOverview(raw,now);
 assert.equal(snapshot.market.buy,145,'New SYP must not be converted');
 assert.equal(snapshot.unit,'SYP_NEW');assert.equal(snapshot.fx[0].pair,'USD/TRY');
 assert.equal(exchangeAge(at,now.getTime()),'reference');
 assert.equal(exchangeAge(at,now.getTime()+17*3600000),'stale');
 assert.equal(exchangeAge(at,now.getTime()+8*86400000),'expired');
 assert.equal(exchangeAge('invalid',now.getTime()),'expired');
 for(const change of [
  {...raw,ok:false},
  {...raw,data:{...raw.data,rates:[]}},
  {...raw,data:{...raw.data,rates:[...raw.data.rates,...raw.data.rates]}},
  {...raw,data:{...raw.data,rates:[{...raw.data.rates[0],cities:{aleppo:{buy:145,sell:146}}}]}},
  {...raw,data:{...raw.data,rates:[{...raw.data.rates[0],cities:{damascus:{buy:147,sell:146}}}]}},
  {...raw,data:{...raw.data,global_fx:[{pair:'USD/TRY',rate:-1}]}},
  {...raw,data:{...raw.data,global_fx:[{pair:'USD/TRY',rate:1},{pair:'USD/TRY',rate:2}]}},
  {...raw,data:{...raw.data,updated_at:new Date(now.getTime()+3600000).toISOString()}},
 ])assert.throws(()=>parseExchangeOverview(change,now));
 const unauthorized=await GET(new Request('https://wallet.test/api/exchange-rates'));
 assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get('cache-control'),'no-store');
 const pg=new PGlite();
 try{
  await pg.exec('CREATE ROLE sirocash_app;CREATE ROLE anon;CREATE ROLE authenticated;');
  await pg.exec(await readFile('prisma/migrations/20261103200000_exchange_reference/migration.sql','utf8'));
  await pg.exec(await readFile('prisma/migrations/20261103210000_exchange_diagnostics/migration.sql','utf8'));
  const db={query:async(sql:string,values?:unknown[])=>pg.query(sql,values)} as unknown as Pick<PoolClient,'query'>;
  let calls=0;
  const deps={db,key:'private-test-key',now:()=>now,fetch:(async(url,options)=>{
   calls++;assert.equal(url,'https://api-v2.sp-today.com/api/v1/overview?lang=en');
   assert.equal(options?.redirect,'error');assert.equal(options?.cache,'no-store');
   assert.equal(new Headers(options?.headers).get('x-api-key'),'private-test-key');
   return Response.json(raw);
  }) as typeof fetch};
  assert.equal(await loadExchangeReference({...deps,key:undefined}),null);assert.equal(calls,0);
  const loaded=await loadExchangeReference(deps);assert.deepEqual(loaded,snapshot);assert.equal(calls,1);
  assert.deepEqual(await loadExchangeReference(deps),snapshot);assert.equal(calls,1);
  assert.equal(await claimExchangeAttempt(db),null,'Other workers/redeploys must share cooldown');
  const reset=()=>pg.exec(`UPDATE "ExchangeReference" SET "nextAttemptAt"=now()-interval '1 second',"blockedUntil"=now()-interval '1 second'`);
  await reset();
  const claims=await Promise.all([claimExchangeAttempt(db),claimExchangeAttempt(db),claimExchangeAttempt(db)]);
  assert.equal(claims.filter(Boolean).length,1);
  await reset();
  await pg.exec('UPDATE "ExchangeReference" SET attempts=93');
  assert.equal(await claimExchangeAttempt(db),null,'Monthly free quota must fail closed');
  await pg.exec(`UPDATE "ExchangeReference" SET month=(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '1 month')::date`);
  assert(await claimExchangeAttempt(db),'New month starts a new budget');
  assert.equal((await pg.query<{attempts:number}>('SELECT attempts FROM "ExchangeReference"')).rows[0].attempts,1);
  await reset();
  assert.deepEqual(await loadExchangeReference({...deps,fetch:(async()=>{calls++;throw Error('secret provider error')}) as typeof fetch}),snapshot);
  assert.equal(calls,2);assert.equal(await claimExchangeAttempt(db),null,'Network failures must consume cooldown');
  await reset();
  assert.deepEqual(await loadExchangeReference({...deps,fetch:(async()=>new Response('x'.repeat(256*1024+1))) as typeof fetch}),snapshot);
  await reset();
  assert.deepEqual(await loadExchangeReference({...deps,fetch:(async()=>Response.json({ok:false,error:{message:'secret'}})) as typeof fetch}),snapshot);
  await reset();
  const old={...raw,data:{...raw.data,rates:[{...raw.data.rates[0],updated_at:new Date(now.getTime()-3600000).toISOString()}]}};
  assert.deepEqual(await loadExchangeReference({...deps,fetch:(async()=>Response.json(old)) as typeof fetch}),snapshot,'Never overwrite with older provider data');
  await reset();
  assert.deepEqual(await loadExchangeReference({...deps,fetch:(async()=>new Response('quota',{status:429})) as typeof fetch}),snapshot);
  await pg.exec(`UPDATE "ExchangeReference" SET "nextAttemptAt"=now()-interval '1 second'`);
  assert.equal(await claimExchangeAttempt(db),null,'429 blocks through next month without reset header');
  await reset();
  const id=(await claimExchangeAttempt(db))!;
  await blockExhaustedExchange(db,id,new Response(null,{headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':String(Math.floor(now.getTime()/1000)+86400)}}),now);
  await pg.exec(`UPDATE "ExchangeReference" SET "nextAttemptAt"=now()-interval '1 second'`);
  assert.equal(await claimExchangeAttempt(db),null,'Exhausted headers block even on HTTP 200');
  // One narrowly scoped bootstrap diagnostic, never repeated by redeployment.
  await pg.exec(`UPDATE "ExchangeReference" SET snapshot=NULL,attempts=1,"blockedUntil"=now()-interval '1 second',"nextAttemptAt"=now()+interval '8 hours',month=date_trunc('month',now() AT TIME ZONE 'UTC')::date`);
  assert.equal(await claimExchangeAttempt(db),null);
  assert(await claimExchangeAttempt(db,undefined,true));
  assert.equal(await claimExchangeAttempt(db,undefined,true),null);
  assert.equal((await pg.query<{attempts:number}>('SELECT attempts FROM "ExchangeReference"')).rows[0].attempts,2);
  await pg.exec(`UPDATE "ExchangeReference" SET attempts=1,"blockedUntil"=now()+interval '1 day'`);
  assert.equal(await claimExchangeAttempt(db,undefined,true),null,'Recovery must not bypass provider exhaustion');
  await pg.exec(`UPDATE "ExchangeReference" SET attempts=93,"blockedUntil"=now()-interval '1 second'`);
  assert.equal(await claimExchangeAttempt(db,undefined,true),null,'Recovery cannot exceed monthly cap');
  const {rows:[priv]}=await pg.query(`SELECT has_table_privilege('anon','"ExchangeReference"','SELECT') anon,has_table_privilege('authenticated','"ExchangeReference"','INSERT') browser,has_table_privilege('sirocash_app','"ExchangeReference"','UPDATE') backend,has_table_privilege('sirocash_app','"ExchangeReference"','DELETE') erase`);
  assert.deepEqual(priv,{anon:false,browser:false,backend:true,erase:false});
  await pg.exec('SET ROLE anon');await assert.rejects(()=>pg.query('SELECT * FROM "ExchangeReference"'));await pg.exec('RESET ROLE');
  const broken={query:async()=>{throw Error('DB_DOWN')}} as unknown as Pick<PoolClient,'query'>;
  assert.equal(await loadExchangeReference({...deps,db:broken}),null);
  console.log('Exchange reference PASS: documented shape/new SYP/no conversion, source timestamps, AR/EN stale/expired/unavailable views, unauthorized no-store, real PostgreSQL durable shared claims/cooldown/month cap/reset, timeout/error/oversize retention, 429/header exhaustion, fail-closed DB and browser isolation. No live API or financial I/O.');
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
