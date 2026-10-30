import {z} from 'zod';
import {passwordSchema,hashPassword,verifyPassword} from './password';
export const passwordChangeSchema=z.object({currentPassword:z.string().min(1,'أدخل كلمة المرور الحالية.').max(128,'كلمة المرور الحالية أطول من الحد المسموح.'),newPassword:passwordSchema,confirmation:passwordSchema}).strict().refine(data=>data.newPassword===data.confirmation,{message:'كلمتا المرور الجديدتان غير متطابقتين.',path:['confirmation']}).refine(data=>data.currentPassword!==data.newPassword,{message:'يجب أن تختلف كلمة المرور الجديدة عن الحالية.',path:['newPassword']});
export type PasswordChangeInput=z.infer<typeof passwordChangeSchema>;
type Client={query:(sql:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
export type PasswordTransaction=<T>(run:(client:Client)=>Promise<T>)=>Promise<T>;
export async function changePassword(userId:string,tokenHash:string,input:PasswordChangeInput,transaction:PasswordTransaction){
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
  const passwordHash=await hashPassword(input.newPassword);
  await c.query('UPDATE "User" SET "passwordHash"=$1 WHERE id=$2',[passwordHash,userId]);
  await c.query('DELETE FROM "AuthSession" WHERE "userId"=$1',[userId]);
  // Pending codes carry a password snapshot; revoke them atomically with the credential change.
  await c.query('DELETE FROM "EmailChallenge" WHERE email=$1',[user.email]);
  return 'changed' as const;
 });
}
