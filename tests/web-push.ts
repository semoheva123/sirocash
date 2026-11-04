import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {savePushSubscription,deliverWebPush} from '../lib/web-push';
import {pushEndpoint,pushSubscriptionInput} from '../lib/web-push-input';
async function main(){
 for(const value of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://web.push.apple.com:8443/x','https://localhost/x','https://169.254.169.254/x'])assert.equal(pushEndpoint(value),false,value);
 for(const value of ['https://fcm.googleapis.com/x','https://updates.push.services.mozilla.com/x','https://web.push.apple.com/x'])assert(pushEndpoint(value));
 const pg=new PGlite(),owner=randomUUID(),other=randomUUID();try{
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;');for(const dir of (await readdir('prisma/migrations')).sort())if(dir!=='migration_lock.toml'){if(dir==='20261105010000_web_push')await pg.exec('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));}
  await pg.query(`INSERT INTO "User"(id,email) VALUES($1,'push-owner@test.invalid'),($2,'push-other@test.invalid')`,[owner,other]);
  await pg.query(`INSERT INTO "AuthSession"("tokenHash","userId","expiresAt") VALUES('session-owner',$1,now()+interval '1 day'),('session-other',$2,now()+interval '1 day')`,[owner,other]);
  const db={query:(sql:string,params?:unknown[])=>pg.query(sql,params)} as unknown as Pick<PoolClient,'query'>;
  const input=pushSubscriptionInput.parse({endpoint:'https://fcm.googleapis.com/fixture',keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')},language:'ar'});
  assert(!pushSubscriptionInput.safeParse({...input,keys:{...input.keys,auth:'short'}}).success);
  await pg.exec('SET ROLE sirocash_app;BEGIN');await savePushSubscription(db,owner,'session-owner',input);await pg.exec('COMMIT');
  await pg.exec('BEGIN');await savePushSubscription(db,owner,'session-owner',input);await pg.exec('COMMIT');
  await pg.exec('BEGIN');await assert.rejects(()=>savePushSubscription(db,other,'session-other',input));await pg.exec('ROLLBACK');
  await pg.exec('BEGIN');await assert.rejects(()=>savePushSubscription(db,owner,'session-other',{...input,endpoint:input.endpoint+'foreign'}));await pg.exec('ROLLBACK');
  const {rows:[count]}=await pg.query<{n:number}>(`SELECT count(*)::int n FROM "WebPushSubscription"`);assert.equal(count.n,1);
  await pg.exec('RESET ROLE');
  await pg.query(`INSERT INTO "AccountNotification"(id,"ownerId",kind,reference) VALUES('push-fixture',$1,'TRANSFER_RECEIVED','private-reference')`,[owner]);
  assert.equal((await pg.query(`SELECT * FROM "WebPushDelivery"`)).rows.length,1,'Queue survives unavailable optional pg_net/vault');
  await pg.exec('BEGIN');await pg.query(`INSERT INTO "AccountNotification"(id,"ownerId",kind,reference) VALUES('rollback',$1,'TRANSFER_RECEIVED','ref')`,[owner]);await pg.exec('ROLLBACK');assert.equal((await pg.query(`SELECT * FROM "WebPushDelivery"`)).rows.length,1);
  await pg.query(`INSERT INTO "AccountNotification"(id,"ownerId",kind,reference) VALUES('foreign-notice',$1,'TRANSFER_RECEIVED','ref')`,[other]);assert.equal((await pg.query(`SELECT * FROM "WebPushDelivery"`)).rows.length,1,'No owner inference or foreign delivery');
  const sent:string[]=[];await pg.exec('SET ROLE sirocash_app');
  const result=await deliverWebPush(db as Pick<Pool,'query'>,async(_s,payload)=>{sent.push(payload)});assert.equal(result.accepted,1);assert.equal(sent.length,1);assert(!sent[0].includes(owner)&&!sent[0].includes('private-reference'));assert.equal(JSON.parse(sent[0]).url,'/notifications');
  await deliverWebPush(db as Pick<Pool,'query'>,async()=>{throw Error('Duplicate send')});assert.equal(sent.length,1);
  await pg.exec('RESET ROLE');await pg.query(`INSERT INTO "AccountNotification"(id,"ownerId",kind,reference) VALUES('uncertain-test',$1,'TRANSFER_RECEIVED','ref')`,[owner]);await pg.exec('SET ROLE sirocash_app');let failures=0;
  await deliverWebPush(db as Pick<Pool,'query'>,async()=>{failures++;throw Error('Timeout')});await deliverWebPush(db as Pick<Pool,'query'>,async()=>{failures++;throw Error('Unexpected retry')});assert.equal(failures,1);
  await pg.exec('RESET ROLE');await pg.query(`INSERT INTO "AccountNotification"(id,"ownerId",kind,reference) VALUES('gone-test',$1,'TRANSFER_RECEIVED','ref')`,[owner]);await pg.exec('SET ROLE sirocash_app');await deliverWebPush(db as Pick<Pool,'query'>,async()=>{throw {statusCode:410}});assert.equal((await pg.query(`SELECT * FROM "WebPushSubscription"`)).rows.length,0);
  await pg.exec('BEGIN');await savePushSubscription(db,owner,'session-owner',input);await pg.exec('COMMIT');
  for(let n=1;n<5;n++){await pg.exec('BEGIN');await savePushSubscription(db,owner,'session-owner',{...input,endpoint:input.endpoint+n});await pg.exec('COMMIT')}
  await pg.exec('BEGIN');await assert.rejects(()=>savePushSubscription(db,owner,'session-owner',{...input,endpoint:input.endpoint+'sixth'}));await pg.exec('ROLLBACK');
  await pg.exec('RESET ROLE');await pg.query(`INSERT INTO "AccountNotification"(id,"ownerId",kind,reference) VALUES('expire-test',$1,'TRANSFER_RECEIVED','ref')`,[owner]);await pg.query(`UPDATE "AuthSession" SET "expiresAt"=now()-interval '1 second' WHERE "tokenHash"='session-owner'`);
  await pg.exec('SET ROLE sirocash_app');const expired=await deliverWebPush(db as Pick<Pool,'query'>,async()=>{throw Error('Expired session sent')});assert.equal(expired.processed,0);
  await pg.exec('RESET ROLE');await pg.query(`DELETE FROM "AuthSession" WHERE "tokenHash"='session-owner'`);assert.equal((await pg.query(`SELECT * FROM "WebPushSubscription"`)).rows.length,0);assert.equal((await pg.query(`SELECT * FROM "WebPushDelivery"`)).rows.length,0);
  const {rows:[grants]}=await pg.query<{safe:boolean}>(`SELECT NOT has_table_privilege('anon','"WebPushSubscription"','SELECT') AND NOT has_table_privilege('authenticated','"WebPushDelivery"','SELECT') AND NOT has_table_privilege('sirocash_financial_worker','"WebPushSubscription"','SELECT') AND NOT has_function_privilege('sirocash_app','public.dispatch_web_push()','EXECUTE') AND NOT has_function_privilege('anon','public.dispatch_web_push()','EXECUTE') AND NOT has_function_privilege('authenticated','public.dispatch_web_push()','EXECUTE') AS safe`);assert(grants.safe);
  console.log('Web Push PASS: real migrated DB, owner/session binding, idempotent consent, SSRF/key validation, committed queue/rollback, no financial I/O, optional wake failure isolation, generic payload, no replay, expiry/revocation and restricted grants. No live push delivery.');
 }finally{await pg.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
