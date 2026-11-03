import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
async function main(){
 const pg=new PGlite(),owner=randomUUID();
 try{
  await pg.exec('CREATE TABLE "ReceivingIdentityBudget"("userId" uuid,action text,"windowStart" timestamptz,count integer,PRIMARY KEY("userId",action));');
  const legacy=await readFile('prisma/migrations/20261103010000_receiving_uid/migration.sql','utf8');
  const old=legacy.slice(legacy.indexOf('CREATE FUNCTION public.receiving_identity_budget'),legacy.indexOf('ALTER TABLE public."ReceivingIdentity" ENABLE'));
  const current=await readFile('prisma/migrations/20261104010000_receiving_budget_window/migration.sql','utf8');
  async function clock(time:string){await pg.query("SELECT set_config('siro.fixture_budget_time',$1,false)",[time])}
  async function consume(kind='lookup'){return (await pg.query<{allowed:boolean}>('SELECT receiving_identity_budget($1,$2) AS allowed',[owner,kind])).rows[0].allowed}
  // Disposable database ONLY; no test clock exists in the deployed function.
  async function install(sql:string){await pg.exec(sql.replaceAll('statement_timestamp()',"current_setting('siro.fixture_budget_time')::timestamptz"));await pg.exec('DELETE FROM "ReceivingIdentityBudget"')}
  await install(old);await clock('2026-11-04T12:59:59Z');for(let i=0;i<10;i++)assert(await consume());assert.equal(await consume(),false);
  await clock('2026-11-04T13:00:00Z');for(let i=0;i<10;i++)assert(await consume());
  await install(current);await clock('2026-11-04T12:59:59Z');for(let i=0;i<10;i++)assert(await consume());
  for(const time of ['2026-11-04T13:00:00Z','2026-11-04T12:59:58Z','2026-11-04T13:00:58.999Z']){await clock(time);assert.equal(await consume(),false)}
  await clock('2026-11-04T13:00:59Z');assert(await consume());
  for(let i=0;i<5;i++)assert(await consume('profile'));assert.equal(await consume('profile'),false);assert.equal(await consume('unknown'),false);
  console.log('Budget boundary PASS: legacy reproduced 20 accepts in 1 second; replacement caps at 10, exact 60s expiry, backward-clock denial, independent profile cap 5, invalid kind denial. Anchored fixed window, not a sliding window.');
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
