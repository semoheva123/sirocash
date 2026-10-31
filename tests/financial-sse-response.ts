import assert from 'node:assert/strict';
import {financialEventResponse} from '../lib/financial-event-response';
async function main(){
 let changed=()=>{},lost=()=>{},reads=0,removed=0,subscribed='';
 const clocks=new Map<number,{fn:()=>void;ms:number}>();let id=0;
 const timeout=((fn:()=>void,ms:number)=>{clocks.set(++id,{fn,ms});return id}) as unknown as typeof setTimeout;
 const clear=((id:number)=>{clocks.delete(id)}) as unknown as typeof clearTimeout;
 const abort=new AbortController();
 const response=financialEventResponse(new Request('https://example.test/api/financial/events?ownerId=bob',{signal:abort.signal}),{
  authenticate:async()=>({id:'alice'}),enabled:()=>true,expiresAt:async()=>new Date(Date.now()+60000),
  subscribe:async(owner,c,l)=>{subscribed=owner;changed=c;lost=l;return ()=>{removed++}},
  snapshot:async()=>{reads++;return Response.json({enabled:true,userId:'alice',balance:{posted:String(reads)}})},
  setTimeout:timeout,clearTimeout:clear,setInterval:timeout as unknown as typeof setInterval,clearInterval:clear as unknown as typeof clearInterval,
 });
 assert.match(response.headers.get('Content-Type')!,/text\/event-stream/);const reader=response.body!.getReader();const text=new TextDecoder();
 assert.match(text.decode((await reader.read()).value),/event: snapshot/);assert.equal(subscribed,'alice');assert.equal(reads,1);
 const pulse=reader.read();[...clocks.values()].find(t=>t.ms===15000)!.fn();assert.match(text.decode((await pulse).value),/event: heartbeat/);assert.equal(reads,1,'heartbeat MUST NOT read financial data');
 const next=reader.read();changed();assert.match(text.decode((await next).value),/"posted":"2"/);assert.equal(reads,2,'committed invalidation pushes a fresh snapshot');
 const end=reader.read();lost();assert.match(text.decode((await end).value),/event: unavailable/);assert((await reader.read()).done);assert.equal(removed,1);assert.equal(clocks.size,0);abort.abort();assert.equal(removed,1);
 const unauth=financialEventResponse(new Request('https://example.test/api/financial/events'),{authenticate:async()=>null,enabled:()=>true,expiresAt:async()=>null,subscribe:async()=>{throw Error('MUST_NOT_SUBSCRIBE')},snapshot:async()=>{throw Error('MUST_NOT_READ')}});
 assert.match(await unauth.text(),/event: session-ended/);
 console.log('Financial SSE response PASS: real ReadableStream framing, trusted-owner subscription, initial snapshot, pushed update, heartbeat without reads, disconnect cleanup and unauthenticated denial.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
