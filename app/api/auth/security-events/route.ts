import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/email-auth';
import {database} from '@/lib/database';
import {securityHeaders,securityFailure,securityError} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const user=await currentUser(request);
  if(!user)return securityFailure('يُرجى تسجيل الدخول مجدداً.',401);
  const {rows}=await database().query('SELECT e.id,e.kind,e."createdAt",(n.id IS NOT NULL) AS "hasNotification",(n."deliveredAt" IS NOT NULL) AS delivered,n.attempts FROM "SecurityEvent" e LEFT JOIN "SecurityNotification" n ON n.id=e.id WHERE e."userId"=$1 ORDER BY e."createdAt" DESC LIMIT 20',[user.id]);
  return NextResponse.json({events:rows.map(e=>({id:e.id,kind:e.kind,createdAt:e.createdAt,emailStatus:!e.hasNotification?'not_requested':e.delivered?'sent':e.attempts>=5?'failed':'queued'}))},{headers:securityHeaders});
 }catch(error){return securityError(error)}
}
