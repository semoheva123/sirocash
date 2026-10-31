import {readJson} from '@/lib/request-body';
import {NextResponse} from 'next/server';
import {sameOrigin} from '@/lib/api';
import {currentUser,sessionTokenHash} from '@/lib/email-auth';
import {database,databaseTransaction} from '@/lib/database';
import {publicSessionId,revokeSessions,revokeSessionsSchema} from '@/lib/account-security';
import {securityHeaders,securityFailure,securityError,clearAuthCookies} from '@/lib/security-http';
import {flushSecurityMail} from '@/lib/security-mail';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const user=await currentUser(request),tokenHash=sessionTokenHash(request);
  if(!user||!tokenHash)return securityFailure('يُرجى تسجيل الدخول مجدداً.',401);
  const {rows}=await database().query('SELECT "tokenHash","expiresAt","createdAt","deviceLabel" FROM "AuthSession" WHERE "userId"=$1 AND "expiresAt">NOW() ORDER BY "expiresAt" DESC LIMIT 100',[user.id]);
  return NextResponse.json({sessions:rows.map(s=>({id:publicSessionId(user.id,s.tokenHash),current:s.tokenHash===tokenHash,expiresAt:s.expiresAt,createdAt:s.createdAt,deviceLabel:s.deviceLabel}))},{headers:securityHeaders});
 }catch(error){return securityError(error)}
}
export async function DELETE(request:Request){
 try{sameOrigin(request)}catch{return securityFailure('الطلب غير مسموح من هذا المصدر.',403)}
 try{
  const input=revokeSessionsSchema.parse(await readJson(request));
  const user=await currentUser(request),tokenHash=sessionTokenHash(request);
  if(!user||!tokenHash)return securityFailure('يُرجى تسجيل الدخول مجدداً.',401);
  const result=await revokeSessions(user.id,tokenHash,input,databaseTransaction);
  if(!result.authorized)return securityFailure('يُرجى تسجيل الدخول مجدداً.',401);
  await flushSecurityMail().catch(()=>{});
  const response=NextResponse.json({ok:true,reauthenticate:result.reauthenticate},{headers:securityHeaders});
  return result.reauthenticate?clearAuthCookies(response):response;
 }catch(error){return securityError(error)}
}
