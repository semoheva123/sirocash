import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {clientRequest} from '../lib/client-request';
import {FinancialReference} from '../components/financial-ui';
import {AccountSettings} from '../components/account-settings';
import {AccountLanguageProvider} from '../components/account-language';
import {useHistoryPages} from '../components/use-history-pages';
import type {FinancialStatus} from '../components/use-financial-status';
const dom=new JSDOM('<div id="root"></div>',{url:'https://wallet.test/settings',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,self:dom.window,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const root=createRoot(document.getElementById('root')!),owner='11111111-2222-4333-8444-555555555555';
async function main(){
 let attempts=0;globalThis.fetch=(async(_url,init)=>{attempts++;return new Promise((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError'))))}) as typeof fetch;
 await assert.rejects(()=>clientRequest('/fixture',{},5),/Timed out/);assert.equal(attempts,1,'Timeout must not replay a write or read');
 globalThis.fetch=(async()=>Object.assign(new Response(''),{arrayBuffer:()=>new Promise<ArrayBuffer>(()=>{})})) as typeof fetch;await assert.rejects(()=>clientRequest('/slow-body',{},5),/Timed out/);
 const cancelled=new AbortController();cancelled.abort();let cancelledCalls=0;globalThis.fetch=(async()=>{cancelledCalls++;return new Response('')}) as typeof fetch;await assert.rejects(()=>clientRequest('/cancelled',{signal:cancelled.signal}));assert.equal(cancelledCalls,0);
 globalThis.fetch=(async()=>new Response(null,{status:204})) as typeof fetch;assert.equal((await clientRequest('/fixture')).status,204);
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});
 await act(async()=>root.render(<FinancialReference value="old-reference" ar={false}/>));await act(async()=>document.querySelector('button')!.click());assert(document.body.textContent!.includes('Copied'));
 await act(async()=>root.render(<FinancialReference value="new-reference" ar={false}/>));assert(!document.body.textContent!.includes('Copied'));
 const calls:string[]=[];globalThis.fetch=(async(url)=>{calls.push(String(url));if(url==='/api/auth/sessions')return Response.json({sessions:[]});if(url==='/api/auth/security-events')return Response.json({events:[]});throw Error('Unexpected request:'+url)}) as typeof fetch;
 await act(async()=>root.render(<AccountLanguageProvider initialLanguage="en"><AccountSettings user={{id:owner,email:'fixture@test.invalid',emailVerifiedAt:'2026-11-04'}}/></AccountLanguageProvider>));assert.equal(calls.length,0,'Hidden settings must not fetch security or identity data');
 await act(async()=>{window.location.hash='#active-sessions';window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'))});assert.deepEqual(calls.sort(),['/api/auth/security-events','/api/auth/sessions']);
 await act(async()=>{window.location.hash='';window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'))});assert.equal(calls.length,2);
 let finish!:(value:Response)=>void;globalThis.fetch=(async()=>new Promise<Response>(resolve=>finish=resolve)) as typeof fetch;
 const status:FinancialStatus={enabled:true,userId:owner,activity:Array.from({length:30},(_,i)=>({id:'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),type:'P2P',amount:'1',status:'COMPLETED',createdAt:'2026-11-01T00:00:00Z'}))};
 function Probe({status}:{status:FinancialStatus}){const h=useHistoryPages(status,'activity');return <><output>{h.combined.activity?.map(r=>r.id).join(',')}</output><button onClick={()=>void h.load()}>Load</button></>}
 await act(async()=>root.render(<Probe status={status}/>));await act(async()=>document.querySelector('button')!.click());
 await act(async()=>root.render(<Probe status={{enabled:true,userId:'foreign',activity:[]}}/>));assert.equal(document.querySelector('output')!.textContent,'');
 await act(async()=>finish(Response.json({userId:owner,activity:[{id:'stale-old-owner',createdAt:'2026-10-01'}],next:null})));assert.equal(document.querySelector('output')!.textContent,'','Late history response cannot cross owner boundaries');
 await act(async()=>root.unmount());console.log('History client PASS: bounded one-attempt requests/204, clipboard feedback reset on changed value, truly lazy settings, old-owner history cancellation/exclusion. Mock transport only.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
