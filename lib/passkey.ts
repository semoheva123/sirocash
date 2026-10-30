import {paymentDigest as digest} from './payment-intent';
import {randomBytes} from 'node:crypto';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import type {WebAuthnCredential} from '@simplewebauthn/server';
import {NextResponse} from 'next/server';
import {sameOrigin} from './api';
import {requireUser} from './email-auth';
type Session={accountId:string;expires:number;userId:Uint8Array;credential?:WebAuthnCredential;challenge?:{value:string;kind:'register'|'authenticate';expires:number;digest?:string};approval?:{token:string;digest:string;expires:number}};
const globalState=globalThis as unknown as {siroPasskeys?:Map<string,Session>};
const sessions=globalState.siroPasskeys??=new Map<string,Session>();
const cookieName='siro-passkey-session';
function context(request:Request){
 sameOrigin(request);
 const origin=process.env.WEBAUTHN_ORIGIN||request.headers.get('origin');
 if(!origin)throw Error('تعذّر تحديد نطاق موثوق لإجراء التحقق من الجهاز.');
 const url=new URL(origin);if(url.protocol!=='https:'&&url.hostname!=='localhost')throw Error('التحقق البيومتري يتطلب اتصال HTTPS.');
 return {origin:url.origin,rpID:url.hostname};
}
function session(request:Request,accountId:string,create=false){
 const now=Date.now();for(const [id,s] of sessions){if(s.expires<now)sessions.delete(id)}
 let id=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 let state=id?sessions.get(id):undefined;if(state&&state.accountId!==accountId)state=undefined;
 if(!state&&create){if(sessions.size>=1000)throw Error('الخدمة غير متاحة مؤقتاً. يُرجى المحاولة لاحقاً.');id=randomBytes(32).toString('hex');state={accountId,expires:now+86400000,userId:new Uint8Array(randomBytes(32))};sessions.set(id,state)}
 if(!state||!id)throw Error('يتطلّب هذا الإجراء تسجيل مفتاح مرور على الجهاز أولاً.');
 return {id,state};
}
export async function handlePasskey(request:Request){
 const {origin,rpID}=context(request);const input=await request.json();
 const user=await requireUser(request);const {id,state}=session(request,user.id,true);
 let result:unknown;
 if(input.action==='status')result={registered:!!state.credential};
 else if(input.action==='register-options'){
  if(state.credential)throw Error('هذا الجهاز مسجّل بالفعل.');
  const options=await generateRegistrationOptions({rpName:'SiroCash',rpID,userID:new Uint8Array(state.userId),userName:'SiroCash demo wallet',attestationType:'none',authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'required'}});
  state.challenge={value:options.challenge,kind:'register',expires:Date.now()+120000};result=options;
 }else if(input.action==='register-verify'){
  const c=state.challenge;delete state.challenge;
  if(!c||c.kind!=='register'||c.expires<Date.now()||state.credential)throw Error('انتهت صلاحية التسجيل.');
  const verification=await verifyRegistrationResponse({response:input.response,expectedChallenge:c.value,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});
  if(!verification.verified||!verification.registrationInfo)throw Error('تعذر التحقق من الجهاز.');
  state.credential=verification.registrationInfo.credential;result={verified:true};
 }else if(input.action==='authenticate-options'){
  if(!state.credential)throw Error('يجب تسجيل مفتاح مرور على الجهاز قبل المتابعة.');
  const operation=digest(input.path,input.payload);
  const options=await generateAuthenticationOptions({rpID,userVerification:'required',allowCredentials:[{id:state.credential.id,transports:state.credential.transports}]});
  state.challenge={value:options.challenge,kind:'authenticate',expires:Date.now()+120000,digest:operation};delete state.approval;result=options;
 }else if(input.action==='authenticate-verify'){
  const c=state.challenge;delete state.challenge;
  if(!c||c.kind!=='authenticate'||c.expires<Date.now()||!c.digest||!state.credential)throw Error('انتهت صلاحية طلب التحقق. يُرجى إعادة المحاولة.');
  const verification=await verifyAuthenticationResponse({response:input.response,expectedChallenge:c.value,expectedOrigin:origin,expectedRPID:rpID,credential:state.credential,requireUserVerification:true});
  if(!verification.verified)throw Error('فشل التحقق من هوية الجهاز.');
  state.credential.counter=verification.authenticationInfo.newCounter;
  const token=randomBytes(32).toString('hex');state.approval={token,digest:c.digest,expires:Date.now()+60000};result={token};
 }else throw Error('إجراء غير صالح.');
 const response=NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 response.cookies.set(cookieName,id,{httpOnly:true,secure:origin.startsWith('https:'),sameSite:'strict',path:'/',maxAge:86400});return response;
}
export async function requirePasskey(request:Request,payload:unknown){
 context(request);const user=await requireUser(request);const {state}=session(request,user.id);const approval=state.approval;
 if(!approval||approval.token!==request.headers.get('x-siro-approval')||approval.expires<Date.now()||approval.digest!==digest(new URL(request.url).pathname,payload))throw Error('يلزم تأكيد العملية ببصمة الجهاز أو مفتاح المرور.');
 // Synchronous, single-use consumption, before any financial mutation.
 delete state.approval;
}
