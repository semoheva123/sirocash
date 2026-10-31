// Invoked only by the protected project-specific Actions workflow. No secret values are logged.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/.test(account||'')||!token)throw Error('Cloudflare credentials are not configured.');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api(path,method='GET',body,allowMissing=false){
 let response;try{response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)})}catch{throw Error('Cloudflare request could not be completed; no credentials were logged.')}
 if(allowMissing&&response.status===404)return null;
 let data;try{data=await response.json()}catch{throw Error('Unexpected Cloudflare response.')}
 if(!response.ok||data.success!==true){const codes=(data.errors||[]).map(e=>e.code).filter(Number.isInteger);if(codes.includes(10042))throw Error('R2 is not enabled for this account. The account owner must enable R2 in the Cloudflare dashboard; this may require billing details. No billing settings were changed.');throw Error(`Cloudflare ${method} ${path} failed (HTTP ${response.status}; codes ${codes.join(',')||'none'}). Check scoped permissions and service activation.`)}
 return data.result;
}
async function main(){
 // D1 can be prepared even when R2 activation is still blocked by the account's billing setup.
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
 const buckets=await api('/r2/buckets');let bucket=(buckets.buckets||[]).find(b=>b.name==='sirocash-identity-private');
 if(!bucket)bucket=await api('/r2/buckets','POST',{name:'sirocash-identity-private'});
 // Explicitly disable public r2.dev access, without creating domains or changing unrelated buckets.
 await api('/r2/buckets/sirocash-identity-private/domains/managed','PUT',{enabled:false});
 const domains=await api('/r2/buckets/sirocash-identity-private/domains/custom');
 if((domains.domains||[]).some(d=>d.enabled))throw Error('Identity bucket has a public custom domain. Refusing to continue; no domains were altered.');
 const config=JSON.parse(await fs.readFile('cloudflare/identity/wrangler.jsonc','utf8'));config.account_id=account;config.d1_databases[0].database_id=id;
 await fs.writeFile('cloudflare/identity/wrangler.generated.json',JSON.stringify(config,null,2)+'\n');
 const name='sirocash-identity',settings=await api(`/workers/scripts/${name}/settings`,'GET',undefined,true);
 if(settings){const binding=(settings.bindings||[]).find(b=>b.type==='d1'&&b.name==='IDENTITY_DB');if(!binding||binding.id!==id)throw Error('Existing Worker does not match this project identity database; refusing overwrite.');}
 const upload=new FormData();
 upload.set('metadata',JSON.stringify({main_module:'worker.mjs',compatibility_date:config.compatibility_date,keep_bindings:['secret_text'],observability:{enabled:false},bindings:[{type:'d1',name:'IDENTITY_DB',id},{type:'r2_bucket',name:'IDENTITY_DOCUMENTS',bucket_name:'sirocash-identity-private'}]}));
 upload.set('worker.mjs',new Blob([await fs.readFile('cloudflare/identity/worker.mjs','utf8')],{type:'application/javascript+module'}),'worker.mjs');
 await api(`/workers/scripts/${name}`,'PUT',upload);
 await api(`/workers/scripts/${name}/schedules`,'PUT',[{cron:'17 * * * *'}]);
 await api(`/workers/scripts/${name}/subdomain`,'POST',{enabled:true,previews_enabled:false});
 const subdomain=await api('/workers/subdomain');
 if(!/^[a-z0-9-]+$/.test(subdomain.subdomain||''))throw Error('Unexpected Worker subdomain.');
 const origin=`https://${name}.${subdomain.subdomain}.workers.dev`;
 const probe=await fetch(origin+'/requests',{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(![401,503].includes(probe.status))throw Error('Worker did not deny unauthenticated access. Collection remains disabled.');
 console.log(`::notice::Private identity bucket and migrated D1 ready. Worker deployed at ${origin}; unauthenticated reads denied. Application collection remains disabled pending server credentials and lifecycle validation.`);

 await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`## SiroCash Cloudflare resources\n\n- Private R2 bucket: sirocash-identity-private; managed public URL disabled; no enabled custom domains.\n- D1: sirocash-identity (${id}).\n- Collection remains disabled pending application integration and lifecycle checks.\n`);
}
main().catch(error=>{console.error(`::error::${error.message}`);process.exitCode=1});
