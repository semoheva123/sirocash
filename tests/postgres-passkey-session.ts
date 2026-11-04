import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {assertDurableSession} from '../lib/durable-passkey';
/** Only invoked by the existing localhost-only disposable PostgreSQL harness. */
export async function passkeySessionAcceptance(pool:Pool,owner:string){
 const sessionHash=randomBytes(32).toString('hex');
 await pool.query(`INSERT INTO "AuthSession" ("tokenHash","userId","expiresAt") VALUES($1,$2,now()+interval '1 hour')`,[sessionHash,owner]);
 const app=await pool.connect(),revoker=await pool.connect();
 const context={userId:owner,sessionHash,origin:'https://fixture.example',rpID:'fixture.example'};
 try{
  await app.query('BEGIN');await app.query('SET LOCAL ROLE sirocash_app');
  assert.equal((await app.query(`SELECT has_any_column_privilege(current_user,'public."AuthSession"','UPDATE') AS allowed`)).rows[0].allowed,false);
  await assert.rejects(()=>app.query('SELECT * FROM "AuthSession" FOR UPDATE'),(e:unknown)=>(e as {code:string}).code==='42501');
  await app.query('ROLLBACK');
  await app.query('BEGIN');await app.query('SET LOCAL ROLE sirocash_app');
  await assertDurableSession(app,context);
  await revoker.query('BEGIN');await revoker.query("SET LOCAL lock_timeout='150ms'");
  await assert.rejects(()=>revoker.query('DELETE FROM "AuthSession" WHERE "tokenHash"=$1',[sessionHash]),(e:unknown)=>(e as {code:string}).code==='55P03');
  await revoker.query('ROLLBACK');
  await app.query('COMMIT');
  assert.equal((await revoker.query('DELETE FROM "AuthSession" WHERE "tokenHash"=$1',[sessionHash])).rowCount,1);
  await app.query('BEGIN');await app.query('SET LOCAL ROLE sirocash_app');
  await assert.rejects(()=>assertDurableSession(app,context),/PASSKEY_SESSION_EXPIRED/);
  await app.query('ROLLBACK');
  console.log('Passkey session PostgreSQL PASS: restricted app has no UPDATE, old direct lock denied, private bridge lock holds through commit, concurrent revocation blocked until commit, revoked session rejected. No real authenticator or financial I/O.');
 }finally{
  await app.query('ROLLBACK');await revoker.query('ROLLBACK');app.release();revoker.release();
  await pool.query('DELETE FROM "AuthSession" WHERE "tokenHash"=$1',[sessionHash]);
 }
}
