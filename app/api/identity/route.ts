import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/email-auth';
import {securityFailure,securityError,securityHeaders} from '@/lib/security-http';
import {identityConfig,identityStorageConfig,identityGateway,identityOrigin,boundedIdentityBody,identityKinds,IDENTITY_CONSENT} from '@/lib/identity';
import {normalizeIdentityImage,identityOcr} from '@/lib/identity-image';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
let processing=false;
export async function GET(request:Request){try{
 const user=await currentUser(request);if(!user)return securityFailure('يُرجى تسجيل الدخول مجدداً.',401);
 const config=identityStorageConfig();if(!config)return NextResponse.json({available:false,request:null},{headers:securityHeaders});
 const response=await identityGateway(user.id,'/requests');if(!response.ok)return securityFailure('خدمة التوثيق غير متاحة مؤقتاً.',503);
 return NextResponse.json({available:!!identityConfig(),retentionDays:config.days,...await response.json()},{headers:securityHeaders});
}catch(error){return securityError(error)}}
export async function POST(request:Request){
 try{identityOrigin(request)}catch{return securityFailure('الطلب غير مسموح من هذا المصدر.',403)}
 let locked=false;
 try{
  const user=await currentUser(request);if(!user)return securityFailure('يُرجى تسجيل الدخول مجدداً.',401);
  if(!user.emailVerifiedAt)return securityFailure('يجب التحقق من البريد الإلكتروني أولاً.',403);
  const config=identityConfig();if(!config)return securityFailure('استقبال وثائق الهوية غير مفعّل حالياً. لم تُحفظ أي وثيقة.',503);
  if(processing)return securityFailure('الفحص مشغول حالياً. يُرجى المحاولة لاحقاً.',429);
  // Claim synchronously before the first await: concurrent requests cannot both enter OCR.
  processing=true;locked=true;
  const quota=await identityGateway(user.id,'/quota',{method:'POST'});if(!quota.ok)return securityFailure('تعذّر استقبال طلب جديد حالياً.',quota.status===429?429:503);
  let form:FormData;try{const bytes=await boundedIdentityBody(request);form=await new Response(new Uint8Array(bytes),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData()}catch{return securityFailure('حجم الملفات أو صيغة الطلب غير صالح. الحد الإجمالي 3 ميغابايت.',400)}
  if(Number(form.get('retentionDays'))!==config.days)return securityFailure('تغيّرت مدة الاحتفاظ. حدّث الصفحة وراجع الموافقة قبل الإرسال.',400);
  const kind=form.get('kind');if(!identityKinds.includes(kind as typeof identityKinds[number])||form.get('consent')!==IDENTITY_CONSENT)return securityFailure('يُرجى اختيار نوع الوثيقة والموافقة على سياسة معالجتها.',400);
  const files=kind==='passport'?[form.get('front')]:[form.get('front'),form.get('back')];
  if(kind==='passport'&&form.get('back'))return securityFailure('يُرجى رفع صفحة بيانات الجواز فقط.',400);
  if(files.some(f=>!(f instanceof File)||!['image/jpeg','image/png'].includes(f.type)||f.size>1500000))return securityFailure('يُرجى رفع صور JPEG أو PNG؛ الحد لكل صورة 1.5 ميغابايت.',400);
  const normalized=[];
  try{for(const file of files as File[])normalized.push(await normalizeIdentityImage(Buffer.from(await file.arrayBuffer())))}catch{return securityFailure('الصورة غير صالحة أو منخفضة الدقة. يلزم 600 بكسل على الأقل لكل ضلع، وصورة ثابتة واضحة.',400)}
  let ocr:Array<{status:'completed';confidence:number;characters:number}|{status:'unavailable'}>;
  try{ocr=await identityOcr(normalized.map(n=>n.data))}catch{ocr=normalized.map(()=>({status:'unavailable'}))}
  const upload=new FormData();upload.set('kind',String(kind));upload.set('consent',IDENTITY_CONSENT);upload.set('retentionDays',String(config.days));
  normalized.forEach((n,i)=>upload.set(i===0?'front':'back',new Blob([new Uint8Array(n.data)],{type:'image/jpeg'}),'document.jpg'));
  upload.set('checks',JSON.stringify(normalized.map((n,i)=>({...n.checks,ocr:ocr[i]}))));
  const result=await identityGateway(user.id,'/requests',{method:'POST',body:upload});
  if(!result.ok)return securityFailure(result.status===409?'يوجد طلب قيد المراجعة بالفعل.':'تعذّر حفظ الطلب. يُرجى التحقق من حالته قبل إعادة الإرسال.',result.status===409?409:503);
  return NextResponse.json(await result.json(),{status:201,headers:securityHeaders});
 }catch(error){return securityError(error)}finally{if(locked)processing=false}
}
export async function DELETE(request:Request){
 try{identityOrigin(request)}catch{return securityFailure('الطلب غير مسموح من هذا المصدر.',403)}
 try{const user=await currentUser(request);if(!user)return securityFailure('يُرجى تسجيل الدخول مجدداً.',401);const result=await identityGateway(user.id,'/requests',{method:'DELETE'});if(!result.ok)return securityFailure('تعذّر إكمال حذف الوثائق. يُرجى إعادة المحاولة.',503);return NextResponse.json({ok:true},{headers:securityHeaders})}catch(error){return securityError(error)}
}
