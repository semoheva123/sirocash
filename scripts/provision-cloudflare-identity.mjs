// Invoked only by the protected project-specific Actions workflow. No secret values are logged.
import fs from 'node:fs/promises';
import {waitForIdentityGateway} from './identity-gateway-readiness.mjs';
import {createHash,randomBytes,createCipheriv,publicEncrypt,constants} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/.test(account||'')||!token)throw Error('Cloudflare credentials are not configured.');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api(path,method='GET',body,allowMissing=false){
 let response;try{response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)})}catch{throw Error('Cloudflare request could not be completed; no credentials were logged.')}
 if(allowMissing&&response.status===404)return null;
 let data;try{data=await response.json()}catch{throw Error('Unexpected Cloudflare response.')}
 if(!response.ok||data.success!==true){const codes=(data.errors||[]).map(e=>e.code).filter(Number.isInteger);throw Error(`Cloudflare ${method} ${path} failed (HTTP ${response.status}; codes ${codes.join(',')||'none'}). Check scoped permissions and service activation.`)}
 return data.result;
}
async function main(){
 // D1-only provisioning: never call R2 or alter billing settings.
 const databases=await api('/d1/database?per_page=1000');let db=databases.find(d=>d.name==='sirocash-identity');
 if(!db)db=await api('/d1/database','POST',{name:'sirocash-identity'});
 const id=db.uuid||db.id;if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Unexpected D1 database identifier.');
 console.log(`::notice::SiroCash identity D1 database ID: ${id}.`);
 const query=async(sql,params=[])=>{const result=await api(`/d1/database/${id}/query`,'POST',{sql,params});if(!Array.isArray(result)||result.some(r=>r.success===false||r.error))throw Error('Identity D1 query failed; no SQL response contents were logged.');return result};
 const tables=(await query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"))[0].results;
 if(tables.some(t=>t.name==='identity_requests')&&!tables.some(t=>t.name==='_siro_identity_migrations'))throw Error('Existing identity schema has no migration journal. Refusing to adopt or overwrite an untracked database.');
 await query('CREATE TABLE IF NOT EXISTS _siro_identity_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
 for(const name of (await fs.readdir('cloudflare/identity/migrations')).filter(n=>n.endsWith('.sql')).sort()){
  const sql=await fs.readFile('cloudflare/identity/migrations/'+name,'utf8'),hash=createHash('sha256').update(sql).digest('hex');
  const record=(await query('SELECT checksum FROM _siro_identity_migrations WHERE name=?',[name]))[0].results[0];
  if(record){if(record.checksum!==hash)throw Error('Applied identity migration checksum differs; refusing replay.');continue}
  // These migrations contain only CREATE TABLE/INDEX. Idempotent DDL supports retry after a partial failure.
  if(/\b(ALTER|DROP|DELETE|UPDATE)\s+(TABLE|FROM|identity_)/i.test(sql))throw Error('This provisioning runner requires explicit handling for destructive or altering migrations.');
  await query(sql.replace(/CREATE (TABLE|UNIQUE INDEX|INDEX) /g,'CREATE $1 IF NOT EXISTS '));
  await query('INSERT INTO _siro_identity_migrations(name,checksum) VALUES (?,?)',[name,hash]);
 }
 console.log('::notice::Identity D1 migrations applied. No primary account or wallet database was modified.');
 const config=JSON.parse(await fs.readFile('cloudflare/identity/wrangler.jsonc','utf8'));config.account_id=account;config.d1_databases[0].database_id=id;
 await fs.writeFile('cloudflare/identity/wrangler.generated.json',JSON.stringify(config,null,2)+'\n');
 const name='sirocash-identity',settings=await api(`/workers/scripts/${name}/settings`,'GET',undefined,true);
 if(settings){const binding=(settings.bindings||[]).find(b=>b.type==='d1'&&b.name==='IDENTITY_DB');if(!binding||binding.id!==id)throw Error('Existing Worker does not match this project identity database; refusing overwrite.');}
 const upload=new FormData();
 upload.set('metadata',JSON.stringify({main_module:'worker.mjs',compatibility_date:config.compatibility_date,keep_bindings:['secret_text'],observability:{enabled:false},bindings:[{type:'d1',name:'IDENTITY_DB',id}]}));
 upload.set('worker.mjs',new Blob([await fs.readFile('cloudflare/identity/worker.mjs','utf8')],{type:'application/javascript+module'}),'worker.mjs');
 await api(`/workers/scripts/${name}`,'PUT',upload);
 try{await api(`/workers/scripts/${name}/schedules`,'PUT',[{cron:'17 * * * *'}])}
 catch(error){console.log('::notice::Optional Worker hourly schedule is unavailable: '+error.message+' The protected application daily lifecycle scheduler must be verified before collection.');}
 let subdomain=await api('/workers/subdomain','GET',undefined,true);
 if(!subdomain?.subdomain)subdomain=await api('/workers/subdomain','PUT',{subdomain:'sirocash-'+account.slice(0,10)});
 await api(`/workers/scripts/${name}/subdomain`,'POST',{enabled:true,previews_enabled:false});
 if(!/^[a-z0-9-]+$/.test(subdomain.subdomain||''))throw Error('Unexpected Worker subdomain.');
 const origin=`https://${name}.${subdomain.subdomain}.workers.dev`;
 // Newly enabled workers.dev DNS/routing may not be ready immediately after upload.
 const waitForGateway=()=>waitForIdentityGateway(origin,{report:message=>console.log('::notice::'+message)});
 const configured=(settings?.bindings||[]).filter(b=>b.type==='secret_text').map(b=>b.name);
 if(!configured.includes('IDENTITY_SERVICE_TOKEN')&&!configured.includes('IDENTITY_REVIEW_TOKEN')){
  const secrets=Object.fromEntries(['IDENTITY_SERVICE_TOKEN','IDENTITY_REVIEW_TOKEN','IDENTITY_SUBJECT_SECRET','CRON_SECRET'].map(key=>[key,randomBytes(32).toString('hex')]));
  for(const value of Object.values(secrets))console.log('::add-mask::'+value);
  for(const name of ['IDENTITY_SERVICE_TOKEN','IDENTITY_REVIEW_TOKEN'])await api('/workers/scripts/sirocash-identity/secrets','PUT',{name,type:'secret_text',text:secrets[name]});
  // One-time confidential handoff: only the workspace's ephemeral private key can open this.
  // The Cloudflare deployment credential is NEVER part of the handoff.
  const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('sirocash-identity-bootstrap-v1:'+account));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify({workerOrigin:origin,secrets}),'utf8'),cipher.final()]);
  const publicKey=await fs.readFile('.github/identity-bootstrap-public.pem','utf8');
  const sealed={v:1,key:publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')};
  console.log('::notice::IDENTITY_BOOTSTRAP_SEALED_V1='+Buffer.from(JSON.stringify(sealed)).toString('base64'));
  await fs.appendFile(process.env.GITHUB_ENV,'IDENTITY_BOOTSTRAP_CREATED=true\nIDENTITY_BOOTSTRAP_CRON_SECRET='+secrets.CRON_SECRET+'\n');
  await waitForGateway();
  // Deployed synthetic test only: private JPEG in D1, isolation, audited read, no self approval,
  // human decision and withdrawal. No real customer account or identity is used.
  const subject=randomBytes(32).toString('hex'),reviewer=randomBytes(32).toString('hex');
  const call=async(path,method='GET',body,review=false,owner=subject)=>{
   const response=await fetch(origin+path,{method,body,headers:{Authorization:'Bearer '+secrets[review?'IDENTITY_REVIEW_TOKEN':'IDENTITY_SERVICE_TOKEN'],[review?'X-Identity-Actor':'X-Identity-Subject']:owner,...(typeof body==='string'?{'Content-Type':'application/json'}:{})},redirect:'error',signal:AbortSignal.timeout(20000)});return response;
  };
  const image=await fs.readFile('tests/fixtures/identity-synthetic.jpg'),form=new FormData();
  form.set('kind','passport');form.set('retentionPolicy','account_lifetime');form.set('retentionDays','0');form.set('consent','identity-v3-d1-account-lifetime');
  form.set('checks',JSON.stringify([{width:900,height:650,contrast:30,ocr:{status:'unavailable'}}]));form.set('front',new Blob([image],{type:'image/jpeg'}),'synthetic.jpg');
  let requestId;
  try{
   const created=await call('/requests','POST',form);if(created.status!==201)throw Error('Deployed D1 synthetic upload failed. Collection remains disabled.');
   const record=(await created.json()).request;requestId=record.id;
   if(!/^[a-f0-9-]{36}$/.test(requestId||'')||record.expiresAt!==null)throw Error('Deployed retention response failed validation.');
   const isolated=await call('/requests','GET',undefined,false,reviewer);if((await isolated.json()).request!==null)throw Error('D1 owner isolation test failed.');
   const read=await call('/review/document?id='+requestId+'&side=front','GET',undefined,true,reviewer);
   if(read.status!==200||!Buffer.from(await read.arrayBuffer()).equals(image))throw Error('Deployed private D1 image round-trip failed.');
   const decision=JSON.stringify({id:requestId,status:'approved',confirmed:true});
   if((await call('/review','POST',decision,true,subject)).status!==409)throw Error('Self-approval was not denied.');
   if((await call('/review','POST',decision,true,reviewer)).status!==200)throw Error('Synthetic review decision failed.');
   if((await call('/requests','DELETE')).status!==200)throw Error('Synthetic withdrawal failed.');
   const remaining=(await query('SELECT count(*) AS n FROM identity_documents WHERE request_id=?',[requestId]))[0].results[0].n;
   if(remaining!==0)throw Error('D1 document deletion test failed.');
   console.log('::notice::Deployed D1 synthetic upload, private byte-for-byte read, owner isolation, self-approval denial, manual review and document deletion passed.');
  }finally{
   // Bound to the freshly generated subject only; never truncate or touch real users.
   await query('DELETE FROM identity_documents WHERE request_id IN (SELECT id FROM identity_requests WHERE subject=?)',[subject]);
   await query('DELETE FROM identity_audit WHERE request_id IN (SELECT id FROM identity_requests WHERE subject=?)',[subject]);
   await query('DELETE FROM identity_requests WHERE subject=?',[subject]);
   await query('DELETE FROM identity_quota WHERE subject=?',[subject]);
  }
 }else if(!configured.includes('IDENTITY_SERVICE_TOKEN')||!configured.includes('IDENTITY_REVIEW_TOKEN'))throw Error('Partial existing service credentials; refusing implicit rotation.');
 await waitForGateway();
 if(configured.includes('IDENTITY_SERVICE_TOKEN'))console.log('::notice::Existing service credentials preserved. This rerun verifies gateway reachability only, not authenticated document or application lifecycle integration.');
 console.log(`::notice::D1-only identity storage and migrated schema ready. Worker deployed at ${origin}; unauthenticated reads denied. Application collection remains disabled pending server credentials and lifecycle validation.`);

 await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`## SiroCash Cloudflare resources\n\n- Documents and request metadata use D1 only; no R2 resources or billing activation required.\n- D1: sirocash-identity (${id}).\n- Collection remains disabled pending application integration and lifecycle checks.\n`);
}
main().catch(error=>{console.error(`::error::${error.message}`);process.exitCode=1});
