import assert from 'node:assert/strict';
import {createStaticExchangeReader,STATIC_EXCHANGE_URL} from '../lib/static-exchange-client';
async function main(){
 let now=Date.now(),calls=0,n=0,active=true,failed=0;const values:unknown[]=[],timers=new Map<number,{fn:()=>void;ms:number}>();
 const snapshot={source:'sp-today',city:'syria-general',unit:'SYP_NEW',observation:'public-page',market:{buy:144,sell:144.5},fx:[{pair:'USD/TRY',rate:50}],fetchedAt:new Date(now).toISOString()};
 let payload:unknown=snapshot;
 const reader=createStaticExchangeReader({now:()=>now,active:()=>active,data:d=>values.push(d),unavailable:()=>failed++,fetch:async(url,options)=>{calls++;assert.equal(url,STATIC_EXCHANGE_URL);assert.equal(options?.credentials,'omit');assert.equal(options?.referrerPolicy,'no-referrer');assert.equal(options?.redirect,'error');return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}})},timer:((fn:()=>void,ms:number)=>{const id=++n;timers.set(id,{fn:()=>{timers.delete(id);fn()},ms});return id}) as unknown as typeof setTimeout,clear:((id:number)=>{timers.delete(id)}) as unknown as typeof clearTimeout});
 const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
 reader.wake();for(let i=0;i<100;i++)reader.wake();await drain();assert.equal(calls,1);assert.equal(values.length,1);assert.equal(timers.size,1);
 active=false;reader.pause();assert.equal(timers.size,0);active=true;reader.wake();await drain();assert.equal(calls,1);assert.equal(timers.size,1,'resume schedules remaining cooldown, not a stalled reader');
 now+=900000;payload={...snapshot,unit:'SYP_OLD'};[...timers.values()][0].fn();await drain();assert.equal(calls,2);assert.equal(failed,1);assert.equal(values.length,1,'invalid data never overwrites prior valid snapshot');
 now+=900000;payload='x'.repeat(20000);[...timers.values()][0].fn();await drain();assert.equal(failed,2);
 reader.stop();assert.equal(timers.size,0);reader.wake();assert.equal(calls,3);
 let aborted=false,timedOut=0;const deadlines=new Map<number,()=>void>();let id=0;
 const slow=createStaticExchangeReader({active:()=>true,data:()=>{throw Error('unexpected data')},unavailable:()=>timedOut++,fetch:async(_url,options)=>new Promise((_resolve,reject)=>{options!.signal!.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'))})}),timer:((fn:()=>void)=>{deadlines.set(++id,fn);return id}) as unknown as typeof setTimeout,clear:((key:number)=>{deadlines.delete(key)}) as unknown as typeof clearTimeout});
 slow.wake();[...deadlines.values()][0]();await drain();assert(aborted);assert.equal(timedOut,1,'timeout ends loading without replay');slow.stop();
 console.log('Static exchange client PASS: fixed independent URL, no cookies/referrer/SSE/wallet API, bounded size/interval, hidden pause/resume, single-flight wake, invalid/oversize retention and teardown.');
}
void main();
