import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {requestRecovery,confirmRecovery,requestEmailChange,confirmEmailChange,revokeSessions,publicSessionId,deviceLabel,recoveryConfirmSchema,emailChangeConfirmSchema,type SecurityTransaction} from '../lib/account-security';
import {hashPassword,verifyPassword} from '../lib/password';
import {recordSecurityEvent,deliverSecurityNotifications,securityAlert} from '../lib/security-events';
import {operationsAllowed} from '../lib/operations-policy';
async function main(){
 const db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated');
 for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await db.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
 const secret='a-security-test-secret-at-least-32-characters',old='Old-password-123456',fresh='New-password-654321';const oldHash=await hashPassword(old);
 const ids:string[]=[];
 for(const email of ['alice@example.test','bob@example.test','carol@example.test']){
  const {rows:[u]}=await db.query<{id:string}>('INSERT INTO "User"(id,email,"emailVerifiedAt","passwordHash") VALUES(gen_random_uuid(),$1,NOW(),$2) RETURNING id',[email,oldHash]);ids.push(u.id);
 }
 const [alice,bob,carol]=ids;
 for(const [token,uid] of [['a1',alice],['a2',alice],['b1',bob],['b2',bob],['c1',carol]])await db.query('INSERT INTO "AuthSession"("tokenHash","userId","expiresAt") VALUES($1,$2,NOW()+INTERVAL \'1 day\')',[token,uid]);
 await db.exec('SET ROLE sirocash_app');
 const transaction:SecurityTransaction=run=>db.transaction(tx=>run({query:(s,v)=>tx.query(s,v)}));
 const resetQuota=()=>db.exec('UPDATE "EmailRateLimit" SET "windowStart"=NOW()-INTERVAL \'2 hours\',"lastSentAt"=NOW()-INTERVAL \'2 hours\',count=0');
 const account=async(id:string)=>(await db.query<{email:string;passwordHash:string}>('SELECT email,"passwordHash" FROM "User" WHERE id=$1',[id])).rows[0];
 const count=async(table:string,id=alice)=>(await db.query(`SELECT id FROM "${table}" WHERE "userId"=$1`,[id])).rows.length;
 const request=()=>requestRecovery('alice@example.test',transaction,secret);
 const r=await request();assert.ok(r.code&&r.email);assert.equal((await account(alice)).passwordHash,oldHash);assert.equal((await db.query('SELECT * FROM "AuthSession" WHERE "userId"=$1',[alice])).rows.length,2);
 const unknown=await requestRecovery('unknown@example.test',transaction,secret);assert.deepEqual(Object.keys(unknown),['challengeId']);
 const suppressed=await request();assert.deepEqual(Object.keys(suppressed),['challengeId']); // cooldown doesn't disclose via public response shape
 const recovery={challengeId:r.challengeId,code:r.code!,newPassword:fresh,confirmation:fresh};
 assert.equal(recoveryConfirmSchema.safeParse({...recovery,userId:bob}).success,false);
 for(let i=0;i<5;i++)assert.equal(await confirmRecovery({...recovery,code:r.code==='111111'?'222222':'111111'},transaction,secret),'invalid_code');
 assert.equal(await confirmRecovery(recovery,transaction,secret),'invalid_code');assert.equal((await account(alice)).passwordHash,oldHash);
 await resetQuota();const expired=await request();assert.ok(expired.code);
 await db.query('UPDATE "AccountSecurityChallenge" SET "expiresAt"=NOW()-INTERVAL \'1 minute\' WHERE id=$1',[expired.challengeId]);
 assert.equal(await confirmRecovery({...recovery,challengeId:expired.challengeId,code:expired.code!},transaction,secret),'invalid_code');
 await resetQuota();const ready=await request();assert.ok(ready.code);
 assert.equal(await confirmRecovery(recovery,transaction,secret),'invalid_code'); // newest request invalidated earlier challenge
 const valid={...recovery,challengeId:ready.challengeId,code:ready.code!};
 const faulty:SecurityTransaction=run=>transaction(c=>run({query:(s,v)=>{if(s.startsWith('INSERT INTO "SecurityNotification"'))throw Error('fault');return c.query(s,v)}}));
 await assert.rejects(()=>confirmRecovery(valid,faulty,secret));assert.equal((await account(alice)).passwordHash,oldHash);assert.equal(await count('SecurityEvent'),0);
 assert.equal(await confirmRecovery(valid,transaction,secret),'changed');assert.ok(await verifyPassword(fresh,(await account(alice)).passwordHash));
 assert.equal((await db.query('SELECT * FROM "AuthSession" WHERE "userId"=$1',[alice])).rows.length,0);assert.equal(await count('AccountSecurityChallenge'),0);
 assert.equal(await confirmRecovery(valid,transaction,secret),'invalid_code');assert.equal((await account(bob)).passwordHash,oldHash);assert.equal(await count('SecurityEvent'),1);
 // Email changes need password + same session + both distinct purpose-bound codes.
 await resetQuota();assert.equal(await requestEmailChange(bob,'a1',{currentPassword:old,newEmail:'new@example.test'},transaction,secret),'unauthorized');
 await resetQuota();assert.equal(await requestEmailChange(bob,'b1',{currentPassword:'wrong-password',newEmail:'new@example.test'},transaction,secret),'wrong_password');
 await resetQuota();assert.equal(await requestEmailChange(bob,'b1',{currentPassword:old,newEmail:'carol@example.test'},transaction,secret),'invalid_email');
 await resetQuota();const change=await requestEmailChange(bob,'b1',{currentPassword:old,newEmail:'new@example.test'},transaction,secret);assert.ok(typeof change==='object');assert.equal((await account(bob)).email,'bob@example.test');
 const emailInput={challengeId:change.challengeId,oldCode:change.oldCode,newCode:change.newCode};
 assert.equal(emailChangeConfirmSchema.safeParse({...emailInput,newEmail:'attacker@example.test'}).success,false);
 assert.equal(await confirmEmailChange(carol,'c1',emailInput,transaction,secret),'invalid_code');
 assert.equal(await confirmEmailChange(bob,'b2',emailInput,transaction,secret),'invalid_code');
 assert.equal(await confirmEmailChange(bob,'b1',{...emailInput,newCode:change.newCode==='111111'?'222222':'111111'},transaction,secret),'invalid_code');
 await assert.rejects(()=>confirmEmailChange(bob,'b1',emailInput,faulty,secret));assert.equal((await account(bob)).email,'bob@example.test');
 assert.equal(await confirmEmailChange(bob,'b1',emailInput,transaction,secret),'changed');assert.equal((await account(bob)).email,'new@example.test');
 assert.equal((await db.query('SELECT * FROM "AuthSession" WHERE "userId"=$1',[bob])).rows.length,0);assert.equal((await account(carol)).email,'carol@example.test');
 assert.equal(await confirmEmailChange(bob,'b1',emailInput,transaction,secret),'unauthorized');
 // Session IDs are domain-separated and cannot be used as session tokens; targeting another user is a no-op.
 await db.query('INSERT INTO "AuthSession"("tokenHash","userId","expiresAt") VALUES($1,$2,NOW()+INTERVAL \'1 day\')',['c2',carol]);
 const own=publicSessionId(carol,'c2');assert.notEqual(own,'c2');assert.equal(own.length,64);
 assert.deepEqual(await revokeSessions(carol,'c1',{action:'revoke',sessionId:publicSessionId(bob,'b1')},transaction),{authorized:true,reauthenticate:false});
 assert.equal((await db.query('SELECT * FROM "AuthSession" WHERE "userId"=$1',[carol])).rows.length,2);
 assert.deepEqual(await revokeSessions(carol,'c1',{action:'revoke',sessionId:own},transaction),{authorized:true,reauthenticate:false});
 assert.deepEqual(await revokeSessions(carol,'c1',{action:'revoke_all'},transaction),{authorized:true,reauthenticate:true});
 assert.deepEqual(await revokeSessions(carol,'c1',{action:'revoke_all'},transaction),{authorized:false,reauthenticate:false});
 // Notification failure is durable; retry accepted delivery updates status, without modifying immutable audit events.
 const c={query:(s:string,v?:unknown[])=>db.query<Record<string,unknown>>(s,v)};
 let sends=0;const fail=await deliverSecurityNotifications(c,async()=>{sends++;throw Error('provider outage')});assert.ok(fail.processed>0);assert.equal(fail.delivered,0);
 assert.equal((await deliverSecurityNotifications(c,async()=>{sends++})).processed,0); // claimed rows cannot be immediately re-sent
 await db.exec('UPDATE "SecurityNotification" SET "nextAttemptAt"=NOW()-INTERVAL \'1 minute\'');
 const delivered=await deliverSecurityNotifications(c,async(to,message,id)=>{assert.ok(to.includes('@'));assert.ok(!message.text.includes(secret));assert.equal(id.length,48)});assert.ok(delivered.delivered>0);
 assert.equal((await deliverSecurityNotifications(c,async()=>{})).processed,0);
 await assert.rejects(()=>db.exec('UPDATE "SecurityEvent" SET kind=\'sign_in\''),/permission denied/);await assert.rejects(()=>db.exec('DELETE FROM "SecurityEvent"'),/permission denied/);
 await assert.rejects(()=>db.exec('UPDATE "User" SET balance=100'),/permission denied/);await assert.rejects(()=>db.exec('UPDATE "User" SET phone=\'+123456789\''),/permission denied/);
 for(const role of ['anon','authenticated']){await db.exec(`RESET ROLE;SET ROLE ${role}`);for(const table of ['AccountSecurityChallenge','SecurityEvent','SecurityNotification'])await assert.rejects(()=>db.exec(`SELECT * FROM "${table}"`),/permission denied/)}
 assert.equal(operationsAllowed(alice,undefined),false);assert.equal(operationsAllowed(alice,'*'),false);assert.equal(operationsAllowed(alice,alice),true);assert.equal(operationsAllowed(bob,alice),false);
 assert.equal(deviceLabel('malicious <script>'), 'Browser · Unknown device');assert.equal(deviceLabel('Mozilla Windows Chrome/130'),'Chrome · Windows');assert.ok(securityAlert('password_changed').text.includes('لا تشارك'));
 await db.close();console.log('Account security: recovery privacy shape, cooldown, hashed single-use expiry/attempts, atomic rollback, dual-email/session/password approval, isolation, durable outbox/retry, append-only audit, session revocation and deny-default operations access passed.');
}
main();
