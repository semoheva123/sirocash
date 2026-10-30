import {createHash,createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {passwordSchema,hashPassword,verifyPassword} from './password';
import {recordSecurityEvent,type SecurityClient} from './security-events';
export type SecurityTransaction=<T>(run:(c:SecurityClient)=>Promise<T>)=>Promise<T>;
export const emailSchema=z.string().trim().email().max(254).transform(v=>v.toLowerCase());
export const recoveryRequestSchema=z.object({email:emailSchema}).strict();
export const recoveryConfirmSchema=z.object({challengeId:z.string().regex(/^[a-f0-9]{48}$/),code:z.string().regex(/^\d{6}$/),newPassword:passwordSchema,confirmation:passwordSchema}).strict().refine(d=>d.newPassword===d.confirmation,{message:'كلمتا المرور غير متطابقتين.'});
export const emailChangeRequestSchema=z.object({currentPassword:z.string().min(1).max(128),newEmail:emailSchema}).strict();
export const emailChangeConfirmSchema=z.object({challengeId:z.string().regex(/^[a-f0-9]{48}$/),oldCode:z.string().regex(/^\d{6}$/),newCode:z.string().regex(/^\d{6}$/)}).strict();
export function securityCode(secret:string,id:string,code:string,channel:'recovery'|'old_email'|'new_email'){
 if(secret.length<32)throw Error('Security configuration unavailable');
 return createHmac('sha256',secret).update(`account-security:${channel}:${id}:${code}`).digest('hex');
}
function matches(stored:unknown,expected:string){const a=Buffer.from(String(stored),'hex'),b=Buffer.from(expected,'hex');return a.length===b.length&&timingSafeEqual(a,b)}
/** Durable reservations survive wrong passwords, mail failures and credential transaction rollback. */
export async function reserveSecurityQuota(transaction:SecurityTransaction,buckets:Array<{id:string;limit:number;cooldown?:number}>){
 return transaction(async c=>{
  for(const bucket of buckets){
   await c.query('INSERT INTO "EmailRateLimit" (id) VALUES($1) ON CONFLICT DO NOTHING',[bucket.id]);
   const {rows:[r]}=await c.query('SELECT count,("windowStart">NOW()-INTERVAL \'1 hour\') AS active,EXTRACT(EPOCH FROM (NOW()-"lastSentAt")) AS elapsed FROM "EmailRateLimit" WHERE id=$1 FOR UPDATE',[bucket.id]);
   if((r.active&&Number(r.count)>=bucket.limit)||(bucket.cooldown&&Number(r.elapsed)<bucket.cooldown))return false;
  }
  for(const bucket of buckets)await c.query('UPDATE "EmailRateLimit" SET count=CASE WHEN "windowStart">NOW()-INTERVAL \'1 hour\' THEN count+1 ELSE 1 END,"windowStart"=CASE WHEN "windowStart">NOW()-INTERVAL \'1 hour\' THEN "windowStart" ELSE NOW() END,"lastSentAt"=NOW() WHERE id=$1',[bucket.id]);
  return true;
 });
}
export async function requestRecovery(email:string,transaction:SecurityTransaction,secret:string){
 const challengeId=randomBytes(24).toString('hex'),code=String(randomInt(100000,1000000));
 const codeHash=securityCode(secret,challengeId,code,'recovery');
 const allowed=await reserveSecurityQuota(transaction,[{id:'security-mail:global',limit:100},{id:'recovery:'+createHash('sha256').update(email).digest('hex'),limit:5,cooldown:60}]);
 if(!allowed)return {challengeId}; // Identical public shape for unknown accounts and quota suppression.
 const target=await transaction(async c=>{
  const {rows:[u]}=await c.query('SELECT id,email,"passwordHash" FROM "User" WHERE email=$1 AND "emailVerifiedAt" IS NOT NULL FOR UPDATE',[email]);
  if(!u||typeof u.passwordHash!=='string')return null;
  await c.query('DELETE FROM "AccountSecurityChallenge" WHERE "userId"=$1 AND purpose=$2',[u.id,'recovery']);
  await c.query('INSERT INTO "AccountSecurityChallenge"(id,"userId",purpose,"oldEmail","oldPasswordHash","codeHash","expiresAt") VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL \'10 minutes\')',[challengeId,u.id,'recovery',u.email,u.passwordHash,codeHash]);
  return {email:String(u.email),code};
 });
 return {challengeId,...(target||{})};
}
async function invalidateCredentials(c:SecurityClient,userId:unknown,email:unknown){
 await c.query('DELETE FROM "AuthSession" WHERE "userId"=$1',[userId]);
 await c.query('DELETE FROM "EmailChallenge" WHERE email=$1',[email]);
 await c.query('DELETE FROM "PasswordChangeChallenge" WHERE "userId"=$1',[userId]);
 await c.query('DELETE FROM "AccountSecurityChallenge" WHERE "userId"=$1',[userId]);
}
export async function confirmRecovery(input:z.infer<typeof recoveryConfirmSchema>,transaction:SecurityTransaction,secret:string){
 const expected=securityCode(secret,input.challengeId,input.code,'recovery');
 return transaction(async c=>{
  // Locate without locking; all credential paths then lock User before challenge rows.
  const {rows:[target]}=await c.query('SELECT "userId" FROM "AccountSecurityChallenge" WHERE id=$1 AND purpose=$2',[input.challengeId,'recovery']);
  if(!target)return 'invalid_code' as const;
  const {rows:[u]}=await c.query('SELECT id,email,"passwordHash" FROM "User" WHERE id=$1 FOR UPDATE',[target.userId]);
  const {rows:[challenge]}=await c.query('SELECT *, ("expiresAt">NOW()) AS active FROM "AccountSecurityChallenge" WHERE id=$1 AND purpose=$2 FOR UPDATE',[input.challengeId,'recovery']);
  if(!u||!challenge||!challenge.active||Number(challenge.attempts)>=5||challenge.oldPasswordHash!==u.passwordHash||challenge.oldEmail!==u.email)return 'invalid_code' as const;
  await c.query('UPDATE "AccountSecurityChallenge" SET attempts=attempts+1 WHERE id=$1',[input.challengeId]);
  if(!matches(challenge.codeHash,expected))return 'invalid_code' as const;
  if(await verifyPassword(input.newPassword,String(u.passwordHash)))return 'unchanged_password' as const;
  const passwordHash=await hashPassword(input.newPassword);
  await c.query('UPDATE "User" SET "passwordHash"=$1 WHERE id=$2',[passwordHash,u.id]);
  await invalidateCredentials(c,u.id,u.email);
  await recordSecurityEvent(c,String(u.id),'password_recovered',String(u.email));
  return 'changed' as const;
 });
}
export async function requestEmailChange(userId:string,tokenHash:string,input:z.infer<typeof emailChangeRequestSchema>,transaction:SecurityTransaction,secret:string){
 const challengeId=randomBytes(24).toString('hex'),oldCode=String(randomInt(100000,1000000)),newCode=String(randomInt(100000,1000000));
 const oldHash=securityCode(secret,challengeId,oldCode,'old_email'),newHash=securityCode(secret,challengeId,newCode,'new_email');
 if(!await reserveSecurityQuota(transaction,[{id:'security-mail:global',limit:100},{id:'email-change:'+userId,limit:5,cooldown:60}]))return 'rate_limited' as const;
 return transaction(async c=>{
  const {rows:[u]}=await c.query('SELECT email,"passwordHash" FROM "User" WHERE id=$1 FOR UPDATE',[userId]);
  const {rows:[s]}=await c.query('SELECT "tokenHash" FROM "AuthSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">NOW()',[tokenHash,userId]);
  if(!u||!s)return 'unauthorized' as const;
  if(!await verifyPassword(input.currentPassword,String(u.passwordHash)))return 'wrong_password' as const;
  if(input.newEmail===u.email)return 'invalid_email' as const;
  const {rows:existing}=await c.query('SELECT id FROM "User" WHERE email=$1',[input.newEmail]);
  if(existing.length)return 'invalid_email' as const;
  await c.query('DELETE FROM "AccountSecurityChallenge" WHERE "userId"=$1 AND purpose=$2',[userId,'email_change']);
  await c.query('INSERT INTO "AccountSecurityChallenge"(id,"userId",purpose,"oldEmail","oldPasswordHash","sessionHash","newEmail","codeHash","secondCodeHash","expiresAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()+INTERVAL \'10 minutes\')',[challengeId,userId,'email_change',u.email,u.passwordHash,tokenHash,input.newEmail,oldHash,newHash]);
  return {challengeId,oldEmail:String(u.email),newEmail:input.newEmail,oldCode,newCode};
 });
}
export async function confirmEmailChange(userId:string,tokenHash:string,input:z.infer<typeof emailChangeConfirmSchema>,transaction:SecurityTransaction,secret:string){
 const expectedOld=securityCode(secret,input.challengeId,input.oldCode,'old_email'),expectedNew=securityCode(secret,input.challengeId,input.newCode,'new_email');
 return transaction(async c=>{
  const {rows:[u]}=await c.query('SELECT email,"passwordHash" FROM "User" WHERE id=$1 FOR UPDATE',[userId]);
  const {rows:[s]}=await c.query('SELECT "tokenHash" FROM "AuthSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">NOW()',[tokenHash,userId]);
  if(!u||!s)return 'unauthorized' as const;
  const {rows:[challenge]}=await c.query('SELECT *, ("expiresAt">NOW()) AS active FROM "AccountSecurityChallenge" WHERE id=$1 AND "userId"=$2 AND "sessionHash"=$3 AND purpose=$4 FOR UPDATE',[input.challengeId,userId,tokenHash,'email_change']);
  if(!challenge||!challenge.active||Number(challenge.attempts)>=5||challenge.oldEmail!==u.email||challenge.oldPasswordHash!==u.passwordHash)return 'invalid_code' as const;
  await c.query('UPDATE "AccountSecurityChallenge" SET attempts=attempts+1 WHERE id=$1',[input.challengeId]);
  if(!matches(challenge.codeHash,expectedOld)||!matches(challenge.secondCodeHash,expectedNew))return 'invalid_code' as const;
  const {rows:existing}=await c.query('SELECT id FROM "User" WHERE email=$1',[challenge.newEmail]);
  if(existing.length)return 'invalid_email' as const;
  await c.query('UPDATE "User" SET email=$1,"emailVerifiedAt"=NOW() WHERE id=$2',[challenge.newEmail,userId]);
  await invalidateCredentials(c,userId,u.email);
  await c.query('DELETE FROM "EmailChallenge" WHERE email=$1',[challenge.newEmail]);
  await recordSecurityEvent(c,userId,'email_changed',String(u.email));
  await recordSecurityEvent(c,userId,'email_changed',String(challenge.newEmail));
  return 'changed' as const;
 });
}
export function publicSessionId(userId:string,hash:string){return createHash('sha256').update(`session-management:${userId}:${hash}`).digest('hex')}
export function deviceLabel(ua:string|null){
 const value=ua||'';
 const browser=/Edg\//.test(value)?'Edge':/Firefox\//.test(value)?'Firefox':/Chrome\//.test(value)?'Chrome':/Safari\//.test(value)?'Safari':'Browser';
 const os=/Android/.test(value)?'Android':/iPhone|iPad/.test(value)?'iOS':/Windows/.test(value)?'Windows':/Macintosh/.test(value)?'macOS':/Linux/.test(value)?'Linux':'Unknown device';
 return `${browser} · ${os}`; // A self-reported label, never a trusted device identity.
}
export const revokeSessionsSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('revoke'),sessionId:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({action:z.literal('revoke_others')}).strict(),z.object({action:z.literal('revoke_all')}).strict(),
]);
export async function revokeSessions(userId:string,tokenHash:string,input:z.infer<typeof revokeSessionsSchema>,transaction:SecurityTransaction){
 return transaction(async c=>{
  const {rows:[u]}=await c.query('SELECT email FROM "User" WHERE id=$1 FOR UPDATE',[userId]);
  const {rows}=await c.query('SELECT "tokenHash" FROM "AuthSession" WHERE "userId"=$1 AND "expiresAt">NOW()',[userId]);
  if(!u||!rows.some(s=>s.tokenHash===tokenHash))return {authorized:false,reauthenticate:false};
  const targets=rows.filter(s=>input.action==='revoke_all'||(input.action==='revoke_others'?s.tokenHash!==tokenHash:publicSessionId(userId,String(s.tokenHash))===input.sessionId));
  for(const target of targets)await c.query('DELETE FROM "AuthSession" WHERE "userId"=$1 AND "tokenHash"=$2',[userId,target.tokenHash]);
  if(targets.length)await recordSecurityEvent(c,userId,input.action==='revoke'?'session_revoked':'sessions_revoked',String(u.email));
  return {authorized:true,reauthenticate:targets.some(s=>s.tokenHash===tokenHash)};
 });
}
