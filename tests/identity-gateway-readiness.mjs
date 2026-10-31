import assert from 'node:assert/strict';
import {waitForIdentityGateway} from '../scripts/identity-gateway-readiness.mjs';
const origin='https://identity.example';const notices=[];let calls=0;const sleeps=[];
await waitForIdentityGateway(origin,{fetcher:async(url,options)=>{
 assert.equal(url,origin+'/requests');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);assert.equal(options.headers,undefined);
 calls++;if(calls===1)throw Object.assign(new Error('DO NOT LOG provider secrets'),{cause:{code:'EAI_AGAIN'}});
 return new Response(null,{status:calls===2?503:401});
},sleep:async ms=>sleeps.push(ms),report:message=>notices.push(message)});
assert.equal(calls,3);assert.equal(sleeps.length,2);assert(notices.some(n=>n.includes('EAI_AGAIN')));assert(!notices.join('').includes('DO NOT LOG'));
for(const status of [200,201,204])await assert.rejects(waitForIdentityGateway(origin,{fetcher:async()=>new Response(null,{status}),sleep:async()=>{}}),/unexpectedly accepted/);
await assert.rejects(waitForIdentityGateway(origin,{attempts:2,fetcher:async()=>new Response(null,{status:503}),sleep:async()=>{}}),/not ready \(HTTP 503\)/);
await assert.rejects(waitForIdentityGateway(origin,{attempts:1,fetcher:async()=>{throw new Error('sensitive error')},sleep:async()=>{}}),/not ready \(NETWORK_ERROR\)/);
console.log('Identity gateway readiness: DNS retry, fail-closed HTTP checks, safe diagnostics and no mutation replay passed.');
