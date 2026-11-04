'use client';
import {clientRequest} from '@/lib/client-request';
import {startRegistration,startAuthentication,browserSupportsWebAuthn} from '@simplewebauthn/browser';
async function call(body:unknown){const r=await clientRequest('/api/security/passkey',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d}
export async function authorizePayment(path:string,payload:unknown):Promise<string>{
 if(!window.isSecureContext||!browserSupportsWebAuthn())throw Error('يلزم متصفح يدعم مفاتيح المرور واتصال HTTPS. لا يمكن تجاوز التحقق.');
 try{
  const status=await call({action:'status'});
  if(!status.registered){
   const optionsJSON=await call({action:'register-options'});
   const response=await startRegistration({optionsJSON});await call({action:'register-verify',response});
  }
  const optionsJSON=await call({action:'authenticate-options',path,payload});
  const response=await startAuthentication({optionsJSON});
  const {token}=await call({action:'authenticate-verify',response});return token;
 }catch(e){if(e instanceof Error&&['NotAllowedError','AbortError'].includes(e.name))throw Error('تم إلغاء التحقق من الجهاز أو انتهت مهلته. لم تُنفّذ العملية.');throw e}
}
