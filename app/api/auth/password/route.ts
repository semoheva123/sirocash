import {NextResponse} from 'next/server';
import {sameOrigin} from '@/lib/api';
import {currentUser,sessionTokenHash} from '@/lib/email-auth';
import {databaseTransaction} from '@/lib/database';
import {changePassword,passwordChangeSchema} from '@/lib/change-password';
import {ZodError} from 'zod';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
function failure(error:string,status:number,extra:Record<string,string>={}){return NextResponse.json({error},{status,headers:{...headers,...extra}})}
export async function POST(request:Request){
 try{sameOrigin(request)}catch{return failure('الطلب غير مسموح من هذا المصدر.',403)}
 try{
  const input=passwordChangeSchema.parse(await request.json());
  const user=await currentUser(request),tokenHash=sessionTokenHash(request);
  if(!user||!tokenHash)return failure('انتهت الجلسة أو لم يتم تسجيل الدخول. يُرجى تسجيل الدخول مجدداً.',401);
  const result=await changePassword(user.id,tokenHash,input,databaseTransaction);
  if(result==='rate_limited')return failure('تم بلوغ الحد المسموح لمحاولات تغيير كلمة المرور. يُرجى المحاولة بعد ساعة.',429,{'Retry-After':'3600'});
  if(result==='unauthorized')return failure('انتهت الجلسة. يُرجى تسجيل الدخول مجدداً.',401);
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
