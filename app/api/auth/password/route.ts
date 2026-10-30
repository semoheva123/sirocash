import {NextResponse} from 'next/server';
import {sameOrigin} from '@/lib/api';
import {currentUser,sessionTokenHash} from '@/lib/email-auth';
import {databaseTransaction} from '@/lib/database';
import {requestPasswordChange,confirmPasswordChange,passwordChangeSchema,passwordOtpSchema} from '@/lib/change-password';
import {Resend} from 'resend';
import {verificationEmail} from '@/lib/verification-email';
import {ZodError} from 'zod';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
function failure(error:string,status:number,extra:Record<string,string>={}){return NextResponse.json({error},{status,headers:{...headers,...extra}})}
export async function POST(request:Request){
 try{sameOrigin(request)}catch{return failure('الطلب غير مسموح من هذا المصدر.',403)}
 try{
  const body=await request.json();
  const confirming=body?.challengeId!==undefined;
  const input=confirming?passwordOtpSchema.parse(body):passwordChangeSchema.parse(body);
  const user=await currentUser(request),tokenHash=sessionTokenHash(request);
  if(!user||!tokenHash)return failure('انتهت الجلسة أو لم يتم تسجيل الدخول. يُرجى تسجيل الدخول مجدداً.',401);
  const secret=process.env.AUTH_SECRET||'';
  if(!confirming&&(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL))return failure('خدمة إرسال البريد غير متاحة حالياً.',503);
  const result=confirming
   ?await confirmPasswordChange(user.id,tokenHash,passwordOtpSchema.parse(input),databaseTransaction,secret)
   :await requestPasswordChange(user.id,tokenHash,passwordChangeSchema.parse(input),databaseTransaction,secret);
  if(typeof result==='object'){
   try{
    const {error}=await new Resend(process.env.RESEND_API_KEY).emails.send({from:process.env.RESEND_FROM_EMAIL!,to:result.email,...verificationEmail(result.code,'password_change')});
    if(error)throw Error('delivery');
   }catch{
    await databaseTransaction(async c=>{await c.query('DELETE FROM "PasswordChangeChallenge" WHERE id=$1',[result.challengeId])});
    return failure('تعذّر إرسال رمز التحقق. لم يتم تغيير كلمة المرور. يُرجى إعادة المحاولة.',503);
   }
   return NextResponse.json({challengeId:result.challengeId,expiresIn:600},{headers});
  }
  if(result==='rate_limited')return failure('تم بلوغ الحد المسموح لمحاولات تغيير كلمة المرور. يُرجى المحاولة بعد ساعة.',429,{'Retry-After':'3600'});
  if(result==='unauthorized')return failure('انتهت الجلسة. يُرجى تسجيل الدخول مجدداً.',401);
  if(result==='invalid_code')return failure('رمز التحقق غير صحيح أو منتهي الصلاحية، أو تم استنفاد المحاولات. يُرجى طلب رمز جديد.',400);
  if(result==='wrong_password')return failure('كلمة المرور الحالية غير صحيحة.',400);
  const response=NextResponse.json({ok:true,reauthenticate:true},{headers});
  for(const name of ['siro-auth','siro-passkey-session'])response.cookies.set(name,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});
  return response;
 }catch(error){
  if(error instanceof ZodError)return failure(error.issues[0].message,400);
  if(error instanceof SyntaxError)return failure('صيغة الطلب غير صالحة.',400);
  return failure('تعذّر تغيير كلمة المرور حالياً. يُرجى إعادة المحاولة.',503);
 }
}
