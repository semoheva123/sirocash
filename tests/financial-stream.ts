import assert from 'node:assert/strict';
import {createFinancialStream,type FinancialEventSource} from '../lib/financial-stream-client';
import {createFinancialChangeHub} from '../lib/financial-change-hub';
import {financialEventConnection} from '../lib/financial-event-connection';
import {readFile} from 'node:fs/promises';
class Source implements FinancialEventSource{
 closed=false;listeners=new Map<string,((e:MessageEvent)=>void)[]>();
 addEventListener(type:string,fn:(e:MessageEvent)=>void){this.listeners.set(type,[...(this.listeners.get(type)??[]),fn])}
 close(){this.closed=true}
 emit(type:string,data:unknown={}){for(const f of this.listeners.get(type)??[])f({data:JSON.stringify(data)} as MessageEvent)}
}
async function main(){
 const sources:Source[]=[],states:string[]=[],snapshots:unknown[]=[],timers=new Map<number,{fn:()=>void;ms:number}>();let active=true,n=0;
 const stream=createFinancialStream<{enabled:boolean;userId:string;balance:string}>({random:()=>0,open:()=>{const s=new Source();sources.push(s);return s},active:()=>active,expectedUserId:'alice',state:s=>states.push(s),data:d=>snapshots.push(d),setTimer:(fn,ms)=>{const id=++n;timers.set(id,{fn:()=>{timers.delete(id);fn()},ms});return id as unknown as ReturnType<typeof setTimeout>},clearTimer:id=>{timers.delete(id as unknown as number)}});
 stream.wake();assert.deepEqual([...timers.values()].map(t=>t.ms),[45000]);const initial=sources[0];initial.emit('snapshot',{enabled:true,userId:'alice',balance:'1'});assert.equal(states.at(-1),'current');
 // Healthy transport timers only watch silence. Heartbeats never request snapshots or reopen.
 for(let i=0;i<100;i++)initial.emit('heartbeat');assert.equal(sources.length,1);assert.equal(snapshots.length,1);assert.deepEqual([...timers.values()].map(t=>t.ms),[45000]);
 initial.emit('snapshot',{enabled:true,userId:'alice',balance:'2'});assert.equal(snapshots.length,2);
 const fresh=stream.refresh();assert(initial.closed);initial.emit('snapshot',{enabled:true,userId:'alice',balance:'stale'});assert.equal(snapshots.length,2);sources.at(-1)!.emit('snapshot',{enabled:true,userId:'alice',balance:'3'});await fresh;
 sources.at(-1)!.emit('error');assert.equal(states.at(-1),'retrying');const retry=[...timers.values()].find(t=>t.ms===1000)!;const before=sources.length;for(let i=0;i<100;i++)stream.wake();assert.equal(sources.length,before);assert.equal([...timers.values()].filter(t=>t.ms===1000).length,1);retry.fn();assert.equal(sources.length,3);
 active=false;stream.pause();assert(sources.at(-1)!.closed);assert.equal(timers.size,0);assert.equal(states.at(-1),'paused');
 active=true;stream.wake();sources.at(-1)!.emit('snapshot',{enabled:true,userId:'bob',balance:'secret'});assert.equal(states.at(-1),'unauthenticated');assert.equal(snapshots.length,3);const count=sources.length;stream.wake();assert.equal(sources.length,count);stream.stop();

 // Deterministic maximum jitter, capped retries, initial watchdog and server reconnect.
 const jitterSources:Source[]=[],jitterTimers=new Map<number,{fn:()=>void;ms:number}>();let jn=0;
 const jitter=createFinancialStream({random:()=>1,open:()=>{const s=new Source();jitterSources.push(s);return s},active:()=>true,data:()=>{},state:()=>{},setTimer:(fn,ms)=>{const id=++jn;jitterTimers.set(id,{fn:()=>{jitterTimers.delete(id);fn()},ms});return id as unknown as ReturnType<typeof setTimeout>},clearTimer:id=>{jitterTimers.delete(id as unknown as number)}});
 jitter.wake();assert.equal([...jitterTimers.values()][0].ms,45000);[...jitterTimers.values()][0].fn();
 for(const expected of [1250,2500,5000,10000,20000,30000,30000]){assert.equal(jitterTimers.size,1);const scheduled=[...jitterTimers.values()][0];assert.equal(scheduled.ms,expected);jitter.wake();assert.equal(jitterTimers.size,1);scheduled.fn();jitterSources.at(-1)!.emit('reconnect')}
 jitter.stop();assert.equal(jitterTimers.size,0);
 let notify!:(payload:string)=>void,lost!:()=>void,connections=0,closes=0,a=0,b=0,disconnected=0;
 const hub=createFinancialChangeHub(async(n,l)=>{connections++;notify=n;lost=l;return async()=>{closes++}});
 const offA=await hub.subscribe('a',()=>a++,()=>disconnected++),offB=await hub.subscribe('b',()=>b++,()=>disconnected++);
 assert.equal(connections,1);notify('invalid');notify(JSON.stringify({ownerId:'a',balance:'never-sent-to-client'}));assert.equal(a,1);assert.equal(b,0);offA();assert.equal(closes,0);offB();await Promise.resolve();assert.equal(closes,1);
 await hub.subscribe('a',()=>a++,()=>disconnected++);lost();await Promise.resolve();assert.equal(disconnected,1);assert.equal(closes,2);
 // A duplicate callback from a retired listener must not kill its replacement.
 const staleLost=lost;let replacementLost=0;const offNew=await hub.subscribe('new',()=>{},()=>replacementLost++);staleLost();assert.equal(replacementLost,0);offNew();
 const disabledSource=new Source();const disabledStates:string[]=[];
 const disabled=createFinancialStream({open:()=>disabledSource,active:()=>true,data:()=>{},state:s=>disabledStates.push(s)});
 disabled.wake();disabledSource.emit('snapshot',{enabled:false,userId:'alice'});assert(disabledSource.closed);assert.equal(disabledStates.at(-1),'disabled');disabled.stop();
 const readSource=new Source(),readStates:string[]=[],readValues:unknown[]=[];
 const readOnly=createFinancialStream({open:()=>readSource,active:()=>true,expectedUserId:'alice',data:d=>readValues.push(d),state:s=>readStates.push(s),setTimer:()=>0 as unknown as ReturnType<typeof setTimeout>,clearTimer:()=>{}});
 readOnly.wake();readSource.emit('snapshot',{enabled:false,readable:true,userId:'alice',balance:{posted:'0',held:'0'}});assert.equal(readStates.at(-1),'current');assert(!readSource.closed);
 for(let i=0;i<100;i++)readSource.emit('heartbeat');assert.equal(readValues.length,1);
 readSource.emit('snapshot',{enabled:false,readable:true,userId:'alice',balance:{posted:'2',held:'0'}});assert.equal(readValues.length,2);assert(!readSource.closed);
 readSource.emit('snapshot',{enabled:false,readable:true,userId:'bob',balance:{posted:'999'}});assert(readSource.closed);assert.equal(readStates.at(-1),'unauthenticated');assert.equal(readValues.length,2);readOnly.stop();
 assert.equal(new URL(financialEventConnection({FINANCIAL_DATABASE_URL:'postgresql://sirocash_financial_worker.project:fixture@aws-0-us-east-1.pooler.supabase.com:6543/postgres'})).port,'5432');
 assert.throws(()=>financialEventConnection({FINANCIAL_DATABASE_URL:'postgresql://postgres:fixture@example.test:6543/postgres'}),/UNSAFE_ROLE/);
 assert.throws(()=>financialEventConnection({FINANCIAL_DATABASE_URL:'postgresql://sirocash_financial_worker:fixture@example.test:6543/postgres'}),/SESSION_CONNECTION/);
 const hook=await readFile('components/use-financial-status.ts','utf8');assert(hook.includes("new EventSource('/api/financial/events')"));assert(!hook.includes('fetch('));
 console.log('Financial SSE PASS: event-driven snapshots, no healthy polling, heartbeat liveness, fresh post-command connection, reconnect, hidden/offline pause, stale-event exclusion, terminal owner mismatch, shared owner-only fan-out and session-pool connection selection.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
