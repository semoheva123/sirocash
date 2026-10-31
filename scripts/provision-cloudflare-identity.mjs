// Invoked only by the protected project-specific Actions workflow. No secret values are logged.
import fs from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/.test(account||'')||!token)throw Error('Cloudflare credentials are not configured.');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api(path,method='GET',body){
 let response;try{response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)})}catch{throw Error('Cloudflare request could not be completed; no credentials were logged.')}
 let data;try{data=await response.json()}catch{throw Error('Unexpected Cloudflare response.')}
 if(!response.ok||data.success!==true){const codes=(data.errors||[]).map(e=>e.code).filter(Number.isInteger);if(codes.includes(10042))throw Error('R2 is not enabled for this account. The account owner must enable R2 in the Cloudflare dashboard; this may require billing details. No billing settings were changed.');throw Error(`Cloudflare ${method} ${path} failed (HTTP ${response.status}; codes ${codes.join(',')||'none'}). Check scoped permissions and service activation.`)}
 return data.result;
}
async function main(){
 const buckets=await api('/r2/buckets');let bucket=(buckets.buckets||[]).find(b=>b.name==='sirocash-identity-private');
 if(!bucket)bucket=await api('/r2/buckets','POST',{name:'sirocash-identity-private'});
 // Explicitly disable public r2.dev access, without creating domains or changing unrelated buckets.
 await api('/r2/buckets/sirocash-identity-private/domains/managed','PUT',{enabled:false});
 const domains=await api('/r2/buckets/sirocash-identity-private/domains/custom');
 if((domains.domains||[]).some(d=>d.enabled))throw Error('Identity bucket has a public custom domain. Refusing to continue; no domains were altered.');
 const databases=await api('/d1/database?per_page=1000');let db=databases.find(d=>d.name==='sirocash-identity');
 if(!db)db=await api('/d1/database','POST',{name:'sirocash-identity'});
 const id=db.uuid||db.id;if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Unexpected D1 database identifier.');
 const config=JSON.parse(await fs.readFile('cloudflare/identity/wrangler.jsonc','utf8'));config.account_id=account;config.d1_databases[0].database_id=id;
 await fs.writeFile('cloudflare/identity/wrangler.generated.json',JSON.stringify(config,null,2)+'\n');
 console.log(`::notice::Private identity bucket ready; D1 database ID: ${id}. No documents have been collected.`);
 await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`## SiroCash Cloudflare resources\n\n- Private R2 bucket: sirocash-identity-private; managed public URL disabled; no enabled custom domains.\n- D1: sirocash-identity (${id}).\n- Collection remains disabled pending application integration and lifecycle checks.\n`);
}
main().catch(error=>{console.error(`::error::${error.message}`);process.exitCode=1});
