import {identityReviewCommand} from '@/lib/identity-review-intent';
import {requireIdentityReviewApproval} from '@/lib/identity-review-approval';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/email-auth';
import {database} from '@/lib/database';
import {operationsAllowed} from '@/lib/operations-policy';
import {verifyPassword} from '@/lib/password';
import {securityFailure,securityError,securityHeaders} from '@/lib/security-http';
import {boundedIdentityBody,identityGateway,identityOrigin} from '@/lib/identity';
export const runtime='nodejs';export const dynamic='force-dynamic';
const passwordSchema=z.string().min(1).max(128);
export async function POST(request:Request){
 try{identityOrigin(request)}catch{return securityFailure('الطلب غير مسموح من هذا المصدر.',403)}
 try{
  const user=await currentUser(request);if(!user||!user.emailVerifiedAt||!operationsAllowed(user.id,process.env.IDENTITY_REVIEWER_IDS))return securityFailure('غير مصرّح بهذا الإجراء.',403);
  // Explicit reviewer allowlist, current password and action-bound WebAuthn MFA; deny by default.
  if(process.env.IDENTITY_REVIEW_ENABLED!=='true'||process.env.SIRO_DURABLE_PASSKEY_ENABLED!=='true')return securityFailure('المراجعة الإدارية غير مفعّلة.',503);
  const raw=JSON.parse((await boundedIdentityBody(request,4096)).toString('utf8'));const password=passwordSchema.parse(raw.password);const {password:ignored,...bodyCommand}=raw;void ignored;const command=identityReviewCommand.parse(bodyCommand);const input={...command,password};
  if(!/^[a-f0-9]{64}$/.test(request.headers.get('x-siro-approval')??''))return securityFailure('يلزم التحقق من الجهاز لكل إجراء مراجعة.',403);
  const quota=await identityGateway(user.id,'/review/auth-attempt',{method:'POST',review:true});if(!quota.ok)return securityFailure('تم بلوغ حد محاولات المراجعة أو تعذّر التحقق.',quota.status===429?429:503);
  const {rows}=await database().query('SELECT "passwordHash" FROM "User" WHERE id=$1',[user.id]);
  if(!rows[0]?.passwordHash||!await verifyPassword(input.password,rows[0].passwordHash))return securityFailure('تعذّر تأكيد صلاحية المراجع.',403);
  await requireIdentityReviewApproval(request,user.id,command);
  let path='/review',method='GET',body:string|undefined;
  if(input.action==='document'){if(!input.id||!input.side)return securityFailure('بيانات الوثيقة غير مكتملة.',400);path+='/document?id='+input.id+'&side='+input.side}
  if(input.action==='decision'){if(!input.id||!input.status||input.confirmed!==true)return securityFailure('يلزم تأكيد المراجعة البشرية.',400);method='POST';body=JSON.stringify({id:input.id,status:input.status,reason:'reason' in input?input.reason:undefined,confirmed:true})}
  const response=await identityGateway(user.id,path,{review:true,method,body});
  if(!response.ok)return securityFailure('تعذّر إكمال المراجعة أو انتهت صلاحية الطلب.',response.status===409?409:503);
  if(input.action==='document')return new Response(response.body,{headers:{...securityHeaders,'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="identity-document.jpg"','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; sandbox"}});
  return NextResponse.json(await response.json(),{headers:securityHeaders});
 }catch(error){return securityError(error)}
}
