// Opt-in production preflight. Uses synthetic bytes only; never creates primary accounts.
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {identityGateway,identityStorageConfig,identityConsent} from '../lib/identity';
import {normalizeIdentityImage,identityOcr} from '../lib/identity-image';
import {GET as lifecycle} from '../app/api/internal/identity-lifecycle/route';
import {database} from '../lib/database';
async function main(){
 if(process.env.IDENTITY_DEPLOYMENT_CHECK!=='true'){
  if(process.env.IDENTITY_COLLECTION_ENABLED==='true'){console.error('Identity deployment preflight: collection requires the deployment check.');process.exitCode=1;return}
  console.log('Identity deployment preflight: skipped (not requested).');return
 }
 let phase='configuration',created=false;
 const subject='synthetic-preflight:'+randomUUID(),other='synthetic-reviewer:'+randomUUID();
 const requireStatus=(response:Response,status:number)=>{if(response.status!==status)throw Error('status')};
 try{
  const config=identityStorageConfig();if(!config||config.policy!=='account_lifetime'||process.env.IDENTITY_LIFECYCLE_ENABLED!=='true'||(process.env.CRON_SECRET||'').length<32)throw Error('configuration');
  phase='lifecycle-denial';requireStatus(await lifecycle(new Request('https://sirocash.vercel.app/api/internal/identity-lifecycle')),401);
  phase='lifecycle-reconciliation';requireStatus(await lifecycle(new Request('https://sirocash.vercel.app/api/internal/identity-lifecycle',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}})),200);
  console.log('Identity deployment preflight: authenticated lifecycle completed; unauthenticated lifecycle denied.');
  phase='gateway-denial';requireStatus(await fetch(config.url+'/requests',{redirect:'error',signal:AbortSignal.timeout(20000)}),401);
  phase='synthetic-image-processing';
  const normalized=await normalizeIdentityImage(await readFile('tests/fixtures/identity-synthetic.jpg'));
  const [ocr]=await identityOcr([normalized.data]);if(ocr.status!=='completed')throw Error('ocr');
  console.log('Identity deployment preflight: hosted image normalization and local OCR completed (synthetic image only).');
  const form=new FormData();form.set('kind','passport');form.set('retentionPolicy',config.policy);form.set('retentionDays','0');form.set('consent',identityConsent(config.policy));
  form.set('checks',JSON.stringify([{...normalized.checks,ocr}]));form.set('front',new Blob([new Uint8Array(normalized.data)],{type:'image/jpeg'}),'synthetic.jpg');
  phase='D1-upload';const response=await identityGateway(subject,'/requests',{method:'POST',body:form});requireStatus(response,201);created=true;
  const {request:record}=await response.json();if(!/^[a-f0-9-]{36}$/.test(record.id)||record.expiresAt!==null)throw Error('retention');
  phase='owner-isolation';const isolated=await identityGateway(other,'/requests');requireStatus(isolated,200);if((await isolated.json()).request!==null)throw Error('isolation');
  phase='private-D1-read';const path='/review/document?id='+record.id+'&side=front';const read=await identityGateway(other,path,{review:true});requireStatus(read,200);
  if(!read.headers.get('cache-control')?.includes('no-store')||!Buffer.from(await read.arrayBuffer()).equals(normalized.data))throw Error('bytes');
  phase='self-approval-denial';const decision=JSON.stringify({id:record.id,status:'approved',confirmed:true});requireStatus(await identityGateway(subject,'/review',{review:true,method:'POST',body:decision}),409);
  phase='synthetic-manual-review';requireStatus(await identityGateway(other,'/review',{review:true,method:'POST',body:decision}),200);
  phase='withdrawal';requireStatus(await identityGateway(subject,'/requests',{method:'DELETE'}),200);created=false;
  phase='deletion-verification';requireStatus(await identityGateway(other,path,{review:true}),404);
  const remaining=await identityGateway(subject,'/requests');requireStatus(remaining,200);if((await remaining.json()).request?.documentsDeleted!==true)throw Error('deletion');
  console.log('Identity deployment preflight: D1 upload, account-lifetime retention, byte-for-byte private read, owner isolation, self-approval denial, manual review and withdrawal/deletion passed.');
 }catch{
  console.error('Identity deployment preflight FAILED at '+phase+'. Collection must remain disabled. No response bodies, credentials or primary-account data were logged.');process.exitCode=1;
 }finally{
  if(created){try{requireStatus(await identityGateway(subject,'/requests',{method:'DELETE'}),200)}catch{console.error('Identity deployment preflight: synthetic cleanup requires retry.');process.exitCode=1}}
  if(process.env.DATABASE_URL)await database().end();
 }
}
main().catch(()=>{console.error('Identity deployment preflight: configuration/import failure.');process.exitCode=1});
