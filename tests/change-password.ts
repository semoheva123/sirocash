import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {requestPasswordChange,confirmPasswordChange,passwordChangeSchema,passwordOtpSchema,type PasswordTransaction} from '../lib/change-password';
import {hashPassword,verifyPassword} from '../lib/password';
import {verificationEmail} from '../lib/verification-email';
async function main(){
 const db=new PGlite();
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated');
 for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await db.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
 const old='Existing-password-123',fresh='New-unique-password-456',secret='test-secret-not-for-production-123456789';
 const oldHash=await hashPassword(old);
 const users:string[]=[];
 for(const email of ['alice@example.test','bob@example.test']){
  const {rows:[u]}=await db.query<{id:string}>('INSERT INTO "User"(id,email,"passwordHash","emailVerifiedAt") VALUES(gen_random_uuid(),$1,$2,NOW()) RETURNING id',[email,oldHash]);users.push(u.id);
 }
 const [alice,bob]=users;
 for(const [token,uid] of [['alice-one',alice],['alice-two',alice],['bob-one',bob]])await db.query('INSERT INTO "AuthSession"("tokenHash","userId","expiresAt") VALUES($1,$2,NOW()+INTERVAL \'1 day\')',[token,uid]);
 for(const [id,email] of [['alice-code','alice@example.test'],['bob-code','bob@example.test']])await db.query('INSERT INTO "EmailChallenge"(id,email,"codeHash",purpose,"expiresAt") VALUES($1,$2,$3,$4,NOW()+INTERVAL \'10 minutes\')',[id,email,'hashed-code','login']);
 await db.exec('SET ROLE sirocash_app');
 const transaction:PasswordTransaction=run=>db.transaction(tx=>run({query:(sql,params)=>tx.query(sql,params)}));
 const input=passwordChangeSchema.parse({currentPassword:old,newPassword:fresh,confirmation:fresh});
 for(const invalid of [{...input,confirmation:'different-password'},{...input,newPassword:old,confirmation:old},{...input,newPassword:'short',confirmation:'short'},{...input,userId:bob}])assert.equal(passwordChangeSchema.safeParse(invalid).success,false);
 assert.equal(passwordOtpSchema.safeParse({challengeId:'a'.repeat(48),code:'123456',newPassword:fresh}).success,false);
 const request=(u=alice,t='alice-one',i=input)=>requestPasswordChange(u,t,i,transaction,secret);
 const confirm=(id:string,code:string,u=alice,t='alice-one')=>confirmPasswordChange(u,t,{challengeId:id,code},transaction,secret);
 assert.equal(await request(alice,'bob-one'),'unauthorized');
 assert.equal(await request(alice,'alice-one',{...input,currentPassword:'wrong-password'}),'wrong_password');
 const hash=async(u=alice)=>(await db.query<{passwordHash:string}>('SELECT "passwordHash" FROM "User" WHERE id=$1',[u])).rows[0].passwordHash;
 const a=await request();assert.ok(typeof a==='object');
 assert.equal(await hash(),oldHash); // Sending email MUST NOT rotate a credential or revoke sessions.
 assert.equal((await db.query('SELECT * FROM "AuthSession" WHERE "userId"=$1',[alice])).rows.length,2);
 const stored=(await db.query<{codeHash:string;newPasswordHash:string}>('SELECT * FROM "PasswordChangeChallenge" WHERE id=$1',[a.challengeId])).rows[0];
 assert.notEqual(stored.codeHash,a.code);assert.notEqual(stored.newPasswordHash,fresh);
 assert.equal(await confirm(a.challengeId,a.code,bob,'bob-one'),'invalid_code');
 assert.equal(await confirm(a.challengeId,a.code,alice,'alice-two'),'invalid_code');
 const wrong=a.code==='111111'?'222222':'111111';
 for(let i=0;i<5;i++)assert.equal(await confirm(a.challengeId,wrong),'invalid_code');
 assert.equal(await confirm(a.challengeId,a.code),'invalid_code');assert.equal(await hash(),oldHash);
 const b=await request();assert.ok(typeof b==='object');
 assert.equal(await confirm(a.challengeId,a.code),'invalid_code'); // Resending invalidates old code.
 await db.query('UPDATE "PasswordChangeChallenge" SET "expiresAt"=NOW()-INTERVAL \'1 minute\' WHERE id=$1',[b.challengeId]);
 assert.equal(await confirm(b.challengeId,b.code),'invalid_code');
 const c=await request();assert.ok(typeof c==='object');
 const faulty:PasswordTransaction=run=>transaction(tx=>run({query:(sql,params)=>{if(sql.startsWith('DELETE FROM "EmailChallenge"'))throw Error('injected failure');return tx.query(sql,params)}}));
 await assert.rejects(()=>confirmPasswordChange(alice,'alice-one',{challengeId:c.challengeId,code:c.code},faulty,secret));
 assert.equal(await hash(),oldHash);assert.equal((await db.query('SELECT * FROM "AuthSession" WHERE "userId"=$1',[alice])).rows.length,2);
 assert.equal(await confirm(c.challengeId,c.code),'changed');
 assert.equal(await verifyPassword(fresh,await hash()),true);assert.equal(await verifyPassword(old,await hash()),false);
 assert.equal(await confirm(c.challengeId,c.code),'unauthorized');
 for(const table of ['AuthSession','PasswordChangeChallenge'])assert.equal((await db.query(`SELECT * FROM "${table}" WHERE "userId"=$1`,[alice])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM "EmailChallenge" WHERE email=$1',['alice@example.test'])).rows.length,0);
 assert.equal(await hash(bob),oldHash);assert.equal((await db.query('SELECT * FROM "AuthSession" WHERE "userId"=$1',[bob])).rows.length,1);
 assert.equal((await db.query('SELECT * FROM "EmailChallenge" WHERE email=$1',['bob@example.test'])).rows.length,1);
 for(let i=0;i<5;i++)assert.equal(await request(bob,'bob-one',{...input,currentPassword:'wrong-password'}),'wrong_password');
 assert.equal(await request(bob,'bob-one'),'rate_limited');
 await db.query('UPDATE "EmailRateLimit" SET "windowStart"=NOW()-INTERVAL \'2 hours\' WHERE id=$1',['password-change:'+bob]);
 assert.ok(typeof await request(bob,'bob-one')==='object');
 await assert.rejects(()=>db.exec('UPDATE "User" SET balance=100'),/permission denied/);
 await assert.rejects(()=>db.exec('UPDATE "User" SET email=\'changed@example.test\''),/permission denied/);
 await db.exec('RESET ROLE; SET ROLE anon');
 await assert.rejects(()=>db.exec('SELECT * FROM "PasswordChangeChallenge"'),/permission denied/);
 const message=verificationEmail('123456','password_change');assert.ok(message.text.includes('تغيير كلمة المرور'));assert.ok(message.text.includes('Confirm your password change'));
 await db.close();
 console.log('Password OTP: no credential change before confirmation, current-password/session binding, hashed single-use codes, expiry, persistent 5-guess limit, resend invalidation, quota, atomic rollback/revocation, other-user isolation and denied public/financial access passed.');
}
main();
