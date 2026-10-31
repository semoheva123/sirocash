import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {database} from '@/lib/database';
import {identityStorageConfig,identityGateway,identitySubject} from '@/lib/identity';
import {securityFailure,securityHeaders,securityError} from '@/lib/security-http';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET||'',provided=request.headers.get('authorization')||'',expected='Bearer '+secret;
 if(secret.length<32||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return securityFailure('غير مصرّح بهذا الإجراء.',401);
 try{
  const config=identityStorageConfig();if(!config||process.env.IDENTITY_LIFECYCLE_ENABLED!=='true')return securityFailure('مزامنة دورة حياة الهوية غير مفعّلة.',503);
  // A complete successful primary-account snapshot is mandatory. Never infer closure from outages,
  // failed lookups, inactivity, an empty page, a missing session or an incomplete pagination result.
  const observedAt=Date.now();
  const {rows}=await database().query<{id:string;total:string}>('SELECT id,count(*) OVER() AS total FROM "User" LIMIT 10001');
  if(rows.length>10000||rows.some(r=>Number(r.total)!==rows.length))return securityFailure('تجاوز حجم الحسابات الحد الآمن للمزامنة. لم يُطلب حذف أي وثيقة.',503);
  const response=await identityGateway('identity-lifecycle','/accounts/reconcile',{method:'POST',body:JSON.stringify({complete:true,observedAt,active:rows.map(r=>identitySubject(r.id,config.subjectSecret))})});
  if(!response.ok)return securityFailure('تعذّرت مزامنة حالة الحسابات. يُرجى التحقق من مهمة الحذف.',503);
  return NextResponse.json({ok:true},{headers:securityHeaders});
 }catch(error){return securityError(error)}
}
