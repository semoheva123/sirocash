import {createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {recordSecurityEvent} from './security-events';
import {z} from 'zod';
import {passwordSchema,hashPassword,verifyPassword} from './password';
export const passwordChangeSchema=z.object({currentPassword:z.string().min(1,'أدخل كلمة المرور الحالية.').max(128,'كلمة المرور الحالية أطول من الحد المسموح.'),newPassword:passwordSchema,confirmation:passwordSchema}).strict().refine(data=>data.newPassword===data.confirmation,{message:'كلمتا المرور الجديدتان غير متطابقتين.',path:['confirmation']}).refine(data=>data.currentPassword!==data.newPassword,{message:'يجب أن تختلف كلمة المرور الجديدة عن الحالية.',path:['newPassword']});
export type PasswordChangeInput=z.infer<typeof passwordChangeSchema>;
type Client={query:(sql:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
export type PasswordTransaction=<T>(run:(client:Client)=>Promise<T>)=>Promise<T>;
export async function requestPasswordChange(userId:string,tokenHash:string,input:PasswordChangeInput,transaction:PasswordTransaction,secret:string){
 if(secret.length<32)throw Error("OTP configuration unavailable");
 // This transaction commits even on a wrong password: failures cannot reset the quota.
 const allowed=await transaction(async c=>{
  const bucket='password-change:'+userId;
  await c.query('INSERT INTO "EmailRateLimit" (id) VALUES ($1) ON CONFLICT DO NOTHING',[bucket]);
  const {rows:[limit]}=await c.query('SELECT count,("windowStart">NOW()-INTERVAL \'1 hour\') AS active FROM "EmailRateLimit" WHERE id=$1 FOR UPDATE',[bucket]);
  if(limit.active&&Number(limit.count)>=5)return false;
  await c.query('UPDATE "EmailRateLimit" SET count=CASE WHEN "windowStart">NOW()-INTERVAL \'1 hour\' THEN count+1 ELSE 1 END,"windowStart"=CASE WHEN "windowStart">NOW()-INTERVAL \'1 hour\' THEN "windowStart" ELSE NOW() END WHERE id=$1',[bucket]);
  return true;
 });
 if(!allowed)return 'rate_limited' as const;
 return transaction(async c=>{
  // Serialize credential changes, then recheck the particular session after taking the lock.
  const {rows:[user]}=await c.query('SELECT email,"passwordHash" FROM "User" WHERE id=$1 FOR UPDATE',[userId]);
  const {rows:[session]}=await c.query('SELECT "tokenHash" FROM "AuthSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">NOW()',[tokenHash,userId]);
  if(!user||!session)return 'unauthorized' as const;
  if(typeof user.passwordHash!=='string'||!await verifyPassword(input.currentPassword,user.passwordHash))return 'wrong_password' as const;
  const challengeId=randomBytes(24).toString('hex'),code=String(randomInt(100000,1000000));
  const newHash=await hashPassword(input.newPassword);
  await c.query('DELETE FROM "PasswordChangeChallenge" WHERE "userId"=$1 OR "expiresAt"<NOW()',[userId]);
  await c.query('INSERT INTO "PasswordChangeChallenge" (id,"userId","sessionHash","oldPasswordHash","newPasswordHash","codeHash","expiresAt") VALUES ($1,$2,$3,$4,$5,$6,NOW()+INTERVAL \'10 minutes\')',[challengeId,userId,tokenHash,user.passwordHash,newHash,passwordOtpHash(secret,challengeId,code)]);
  return {challengeId,code,email:String(user.email)};
 });
}
export const passwordOtpSchema=z.object({challengeId:z.string().regex(/^[a-f0-9]{48}$/),code:z.string().regex(/^\d{6}$/)}).strict();
export function passwordOtpHash(secret:string,id:string,code:string){
 if(secret.length<32)throw Error('OTP configuration unavailable');
 return createHmac('sha256',secret).update('password-change:'+id+':'+code).digest('hex');
}
export async function confirmPasswordChange(userId:string,tokenHash:string,input:z.infer<typeof passwordOtpSchema>,transaction:PasswordTransaction,secret:string){
 const expected=passwordOtpHash(secret,input.challengeId,input.code);
 return transaction(async c=>{
  const {rows:[user]}=await c.query('SELECT email,"passwordHash" FROM "User" WHERE id=$1 FOR UPDATE',[userId]);
  const {rows:[session]}=await c.query('SELECT "tokenHash" FROM "AuthSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">NOW()',[tokenHash,userId]);
  if(!user||!session)return 'unauthorized' as const;
  const {rows:[challenge]}=await c.query('SELECT *, ("expiresAt">NOW()) AS active FROM "PasswordChangeChallenge" WHERE id=$1 AND "userId"=$2 AND "sessionHash"=$3 FOR UPDATE',[input.challengeId,userId,tokenHash]);
  if(!challenge||!challenge.active||Number(challenge.attempts)>=5||challenge.oldPasswordHash!==user.passwordHash)return 'invalid_code' as const;
  // Commit incorrect guesses too; never throw to report a wrong code.
  await c.query('UPDATE "PasswordChangeChallenge" SET attempts=attempts+1 WHERE id=$1',[input.challengeId]);
  if(!timingSafeEqual(Buffer.from(String(challenge.codeHash),'hex'),Buffer.from(expected,'hex')))return 'invalid_code' as const;
  await c.query('UPDATE "User" SET "passwordHash"=$1 WHERE id=$2',[challenge.newPasswordHash,userId]);
  await c.query('DELETE FROM "AuthSession" WHERE "userId"=$1',[userId]);
  await c.query('DELETE FROM "EmailChallenge" WHERE email=$1',[user.email]);
  await c.query('DELETE FROM "PasswordChangeChallenge" WHERE "userId"=$1',[userId]);
  await c.query('DELETE FROM "AccountSecurityChallenge" WHERE "userId"=$1',[userId]);
  await recordSecurityEvent(c,userId,'password_changed',String(user.email));
  return 'changed' as const;
 });
}
