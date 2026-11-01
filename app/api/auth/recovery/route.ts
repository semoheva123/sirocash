import {readJson} from '@/lib/request-body';
import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {Resend} from 'resend';
import {sameOrigin} from '@/lib/api';
import {databaseTransaction} from '@/lib/database';
import {requestRecovery,confirmRecovery,recoveryRequestSchema,recoveryConfirmSchema} from '@/lib/account-security';
import {verificationEmail} from '@/lib/verification-email';
import {securityHeaders,securityFailure,securityError,clearAuthCookies} from '@/lib/security-http';
import {flushSecurityMail} from '@/lib/security-mail';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{sameOrigin(request)}catch{return securityFailure('الطلب غير مسموح من هذا المصدر.',403)}
 try{
  const body=await readJson(request),secret=process.env.AUTH_SECRET||'';
  if(body?.challengeId!==undefined){
   const result=await confirmRecovery(recoveryConfirmSchema.parse(body),databaseTransaction,secret);
   if(result!=='changed')return securityFailure(result==='unchanged_password'?'يجب اختيار كلمة مرور جديدة تختلف عن السابقة.':'رمز التحقق غير صحيح أو منتهي الصلاحية، أو تم استنفاد المحاولات.',400);
   await flushSecurityMail().catch(()=>{});
   return clearAuthCookies(NextResponse.json({ok:true,reauthenticate:true},{headers:securityHeaders}));
  }
  const {email}=recoveryRequestSchema.parse(body);
  if(secret.length<32||!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return securityFailure('خدمة استعادة الحساب غير متاحة مؤقتاً.',503);
  // The response never reveals registration, verification, quota, or delivery outcome.
  const started=Date.now();let challengeId=randomBytes(24).toString('hex');
  try{
   const result=await requestRecovery(email,databaseTransaction,secret);challengeId=result.challengeId;
   if(result.email&&result.code){
    const {error}=await new Resend(process.env.RESEND_API_KEY).emails.send({from:process.env.RESEND_FROM_EMAIL,to:result.email,...verificationEmail(result.code,'recovery')});
    if(error)throw Error('delivery');
   }
  }catch{
   await databaseTransaction(async c=>{await c.query('DELETE FROM "AccountSecurityChallenge" WHERE id=$1 AND purpose=$2',[challengeId,'recovery'])}).catch(()=>{});
  }
  // Reduces obvious fast-path timing disclosure; provider/network timing is not guaranteed equal.
  await pause(Math.max(0,1000-(Date.now()-started)));
  return NextResponse.json({challengeId,expiresIn:600,message:'إذا كان البريد مرتبطاً بحساب مؤهّل للاستعادة، فسيُرسل إليه رمز تحقق. يُرجى الانتظار دقيقة قبل طلب رمز آخر.'},{headers:securityHeaders});
 }catch(error){return securityError(error)}
}
