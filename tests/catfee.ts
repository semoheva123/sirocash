import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {catFeeCredentials,catFeeReadClient} from '../lib/catfee';
async function main(){
 const credentials={key:'fixture-key',secret:'fixture-secret'};let calls=0,mode='normal';
 const mock=(async(url,init)=>{
  calls++;const u=new URL(String(url)),h=new Headers(init?.headers),timestamp=h.get('CF-ACCESS-TIMESTAMP')!;
  assert.equal(u.origin,'https://api.catfee.io');assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
  assert.equal(h.get('CF-ACCESS-KEY'),credentials.key);assert.equal(h.get('CF-ACCESS-SIGN'),createHmac('sha256',credentials.secret).update(timestamp+'GET'+u.pathname+u.search).digest('base64'));assert(Number.isFinite(Date.parse(timestamp)));
  assert(['/v1/account','/v1/estimate','/v1/order'].includes(u.pathname));
  if(mode==='error')return new Response(JSON.stringify({code:112,msg:'fixture-secret'}),{headers:{'content-type':'application/json'}});
  if(mode==='oversize')return new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}});
  if(mode==='unsafe')return new Response(JSON.stringify({code:0,data:9007199254740992}),{headers:{'content-type':'application/json'}});
  if(u.pathname==='/v1/estimate'){assert.equal(u.search,'?quantity=65000&duration=1h');return new Response(JSON.stringify({code:0,data:1820000}),{headers:{'content-type':'application/json'}})}
  return new Response(JSON.stringify({code:0,data:{balance:'123456789012345678'}}),{headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 assert.throws(()=>catFeeCredentials({}),/CONFIGURATION/);assert.throws(()=>catFeeCredentials({CATFEE_API_KEY:'bad\nkey',CATFEE_API_SECRET:'s'}),/CONFIGURATION/);
 const read=catFeeReadClient(credentials,mock);assert.equal((await read.balance()).balanceSun,123456789012345678n);assert.equal(await read.estimate(65000),1820000n);
 const before=calls;await assert.rejects(()=>read.estimate(1),/QUANTITY/);assert.equal(calls,before);
 mode='error';await assert.rejects(()=>read.estimate(65000),e=>e instanceof Error&&!e.message.includes('fixture-secret'));
 mode='oversize';await assert.rejects(()=>read.balance(),/UNVERIFIED/);
 mode='unsafe';await assert.rejects(()=>read.estimate(65000));
 const aborted=new AbortController();aborted.abort();const n=calls;await assert.rejects(()=>read.estimate(65000,aborted.signal));assert.equal(calls,n);
 await assert.rejects(()=>catFeeReadClient(credentials,async()=>new Response('',{status:302})).balance());
 console.log('CatFee GET-only: exact HMAC path/query, integer SUN, bounded response, sanitized errors, abort and no purchase passed. Fixtures only.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
