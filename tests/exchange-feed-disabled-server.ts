import assert from 'node:assert/strict';
import {GET as snapshot} from '../app/api/exchange-rates/route';
import {GET as events} from '../app/api/exchange-rates/events/route';
import {wakePublicExchange} from '../lib/exchange-public-wake';
async function main(){
 const originalFetch=globalThis.fetch;let fetched=0;
 globalThis.fetch=async()=>{fetched++;throw Error('EXTERNAL_CALL_FORBIDDEN')};
 try{
  for(const handler of [snapshot,events])for(const cookie of ['', 'siro-auth=untrusted-fixture']){
   const response=await handler(new Request('https://fixture.test/api/exchange-rates',{headers:{cookie}}));
   assert.equal(response.status,204);assert.equal(await response.text(),'');assert.equal(response.headers.get('cache-control'),'no-store');assert(!response.headers.get('content-type')?.includes('event-stream'));
  }
  await wakePublicExchange();assert.equal(fetched,0);
  console.log('Disabled exchange routes PASS: actual GET handlers return empty no-store 204, with/without cookies, no listener/source request or database configuration required.');
 }finally{globalThis.fetch=originalFetch}
}
void main();
