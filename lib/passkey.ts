import {readJson} from './request-body';
import {NextResponse} from 'next/server';
import {sameOrigin,PublicApiError} from './api';
import {requireUser,sessionTokenHash} from './email-auth';
import {databaseTransaction} from './database';
import {durablePasskeyAction} from './durable-passkey';
import type {WalletDb} from './wallet-engine';
function context(request:Request){
 sameOrigin(request);
 const configured=process.env.WEBAUTHN_ORIGIN;
 if(process.env.NODE_ENV==='production'&&!configured)throw Error('لم يُضبط نطاق التحقق الموثوق من الجهاز بعد.');
 const origin=configured||request.headers.get('origin');
 if(!origin)throw Error('تعذّر تحديد نطاق موثوق لإجراء التحقق من الجهاز.');
 const url=new URL(origin);
 if(url.origin!==origin||url.username||url.password||(url.protocol!=='https:'&&url.hostname!=='localhost')||request.headers.get('origin')!==url.origin)throw Error('نطاق التحقق من الجهاز غير موثوق.');
 return {origin:url.origin,rpID:url.hostname};
}
export async function handlePasskey(request:Request){
 const c=context(request);
 if(process.env.SIRO_DURABLE_PASSKEY_ENABLED!=='true')throw Error('يجري تجهيز خدمة التحقق الدائم من الجهاز. لا يمكن اعتماد عمليات مالية حالياً.');
 const user=await requireUser(request),sessionHash=sessionTokenHash(request);
 if(!sessionHash)throw Error('يرجى تسجيل الدخول مجدداً.');
 const input=await readJson(request,65536);
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.action!=='string')throw Error('طلب غير صالح.');
 const db:WalletDb={transaction:run=>databaseTransaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows})}))};
 try{
  const result=await durablePasskeyAction(db,{...c,userId:user.id,sessionHash},input);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{
  // Never return SQL/provider/credential details through apiError.
  throw Error('تعذّر اعتماد التحقق من الجهاز. يرجى إعادة المحاولة أو تسجيل الدخول مجدداً.');
 }
}
export async function requirePasskey(request:Request,_payload:unknown){
 context(request);await requireUser(request);
 // No detached approval consumption: a future financial service must consume the durable
 // approval in the SAME DB transaction as reservation/posting. Legacy demo debit stays unreachable.
 throw new PublicApiError('الخدمات المالية غير مفعّلة للحسابات المسجّلة حالياً. لم تُنفّذ أي عملية.');
}
