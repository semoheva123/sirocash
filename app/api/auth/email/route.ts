import {readJson} from '@/lib/request-body';
import {NextResponse} from 'next/server';
import {Resend} from 'resend';
import {sameOrigin} from '@/lib/api';
import {currentUser,sessionTokenHash} from '@/lib/email-auth';
import {databaseTransaction} from '@/lib/database';
import {requestEmailChange,confirmEmailChange,emailChangeRequestSchema,emailChangeConfirmSchema} from '@/lib/account-security';
import {verificationEmail} from '@/lib/verification-email';
import {securityHeaders,securityFailure,securityError,clearAuthCookies} from '@/lib/security-http';
import {flushSecurityMail} from '@/lib/security-mail';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{sameOrigin(request)}catch{return securityFailure('الطلب غير مسموح من هذا المصدر.',403)}
 try{
  const body=await readJson(request),confirming=body?.challengeId!==undefined;
  const input=confirming?emailChangeConfirmSchema.parse(body):emailChangeRequestSchema.parse(body);
  const user=await currentUser(request),tokenHash=sessionTokenHash(request);
  if(!user||!tokenHash)return securityFailure('يُرجى تسجيل الدخول مجدداً.',401);
  const secret=process.env.AUTH_SECRET||'';
  if(!confirming&&(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL))return securityFailure('خدمة إرسال البريد غير متاحة مؤقتاً.',503);
  const result=confirming?await confirmEmailChange(user.id,tokenHash,emailChangeConfirmSchema.parse(input),databaseTransaction,secret):await requestEmailChange(user.id,tokenHash,emailChangeRequestSchema.parse(input),databaseTransaction,secret);
  if(typeof result==='object'){
   try{
    const resend=new Resend(process.env.RESEND_API_KEY);
    // Both distinct, purpose-bound codes must be delivered before presenting the confirmation step.
    for(const [to,code,purpose] of [[result.oldEmail,result.oldCode,'email_change_old'],[result.newEmail,result.newCode,'email_change_new']] as const){
     const {error}=await resend.emails.send({from:process.env.RESEND_FROM_EMAIL!,to,...verificationEmail(code,purpose)});
     if(error)throw Error('delivery');
    }
   }catch{
    await databaseTransaction(async c=>{await c.query('DELETE FROM "AccountSecurityChallenge" WHERE id=$1',[result.challengeId])});
    return securityFailure('تعذّر إرسال رمزي التحقق. لم يتم تغيير البريد الإلكتروني. قد يكون إعداد الإرسال التجريبي لا يسمح بالبريد الجديد.',503);
   }
   return NextResponse.json({challengeId:result.challengeId,expiresIn:600},{headers:securityHeaders});
  }
  if(result==='rate_limited')return securityFailure('يُرجى الانتظار دقيقة بين الطلبات. الحد الأقصى خمسة طلبات في الساعة.',429);
  if(result==='unauthorized')return securityFailure('يُرجى تسجيل الدخول مجدداً.',401);
  if(result==='wrong_password')return securityFailure('كلمة المرور الحالية غير صحيحة.',400);
  if(result==='invalid_email')return securityFailure('لا يمكن اعتماد البريد الإلكتروني المقترح.',400);
  if(result==='invalid_code')return securityFailure('رمزا التحقق غير صحيحين أو منتهيا الصلاحية، أو تم استنفاد المحاولات.',400);
  await flushSecurityMail().catch(()=>{});
  return clearAuthCookies(NextResponse.json({ok:true,reauthenticate:true},{headers:securityHeaders}));
 }catch(error){return securityError(error)}
}
