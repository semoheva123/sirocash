import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {DepositPanel} from '../components/deposit-panel';
const dom=new JSDOM('<div id="root"></div>',{url:'https://wallet.example',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
class Source{
 static current:Source;listeners=new Map<string,(event:{data:string})=>void>();
 constructor(){Source.current=this}close(){}addEventListener(type:string,fn:(event:{data:string})=>void){this.listeners.set(type,fn)}
 snapshot(deposits=true){this.listeners.get('snapshot')!({data:JSON.stringify({enabled:true,userId:'owner',capabilities:{deposits,withdrawals:false}})})}
}
Object.assign(globalThis,{EventSource:Source});
const root=createRoot(document.getElementById('root')!);
const text=()=>document.body.textContent!;
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent!.includes(label))!;
const click=async(label:string)=>{await act(async()=>button(label).click())};
const trc='T'+'A'.repeat(33),bep='0x'+'a'.repeat(40);
let requests:Record<string,unknown>[]=[];
let reply:(body:Record<string,unknown>)=>Promise<Response>=async b=>Response.json({chain:b.chain,asset:'USDT',address:b.chain==='TRC20'?trc:bep,demo:false});
globalThis.fetch=(async(_url,options)=>{const body=JSON.parse(String(options!.body));requests.push(body);return reply(body)}) as typeof fetch;
let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(v:string)=>{copied=v}},configurable:true});
async function main(){
 await act(async()=>root.render(<DepositPanel ar={false} userId="owner"/>));
 assert(text().includes('USDC · Coming soon'));assert(!Array.from(document.querySelectorAll('button')).some(b=>b.textContent?.includes('USDC')));
 assert(text().includes('Checking deposit availability'));assert.equal(requests.length,0);assert(!document.querySelector('input'));
 await act(async()=>Source.current.snapshot());
 assert(text().includes('TRON'));assert(text().includes('BNB Smart Chain'));assert.equal(requests.length,0,'No automatic allocation');
 await click('Show deposit address');assert.deepEqual(requests[0],{chain:'TRC20',asset:'USDT'});
 assert.equal(document.querySelector('input')!.value,trc);assert(document.querySelector('svg[role="img"]'));
 await click('Copy address');assert.equal(copied,trc);assert(text().includes('Address copied'));
 await click('BNB Smart Chain');assert(!document.querySelector('input'));assert(!text().includes('Address copied'));
 await click('Show deposit address');assert.equal(document.querySelector('input')!.value,bep);
 await act(async()=>Source.current.snapshot(false));assert(!document.querySelector('input'));assert(!document.querySelector('svg[role="img"]'));
 await act(async()=>Source.current.snapshot());
 let resolve!:(r:Response)=>void;reply=()=>new Promise(r=>{resolve=r});
 await click('Show deposit address');assert(text().includes('Verifying address'));
 await click('TRON');await act(async()=>resolve(Response.json({chain:'BEP20',asset:'USDT',address:bep,demo:false})));
 assert(!document.querySelector('input'),'Stale network reply must never display');
 reply=async()=>Response.json({chain:'BEP20',asset:'USDT',address:bep,demo:false});
 await click('Show deposit address');assert(document.querySelector('[role="alert"]'));assert(!document.querySelector('input'),'Wrong chain rejected');
 reply=async()=>Response.json({chain:'TRC20',asset:'USDT',address:trc,demo:true});
 await click('Show deposit address');assert(!document.querySelector('input'),'Demo response rejected');
 reply=async()=>Response.json({chain:'TRC20',asset:'USDT',address:trc,demo:false});
 await click('Show deposit address');
 Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied')}},configurable:true});
 await click('Copy address');assert(text().includes('Copy failed'));assert.equal(document.querySelector('input')!.value,trc);
 await act(async()=>root.render(<DepositPanel ar={true} userId="owner"/>));assert(text().includes('USDC · سيتوفر قريباً'));assert(text().includes('اختر شبكة الإيداع'));assert(text().includes('نسخ العنوان'));
 await act(async()=>Source.current.listeners.get('session-ended')!({data:''}));assert(!document.querySelector('input'));
 await act(async()=>root.unmount());
 console.log('Deposit UI PASS: network choice, verified QR/address, exact copy, capability/session gates, no automatic allocation, stale request rejection, wrong chain/demo rejection, clipboard failure, Arabic/English. Mocked transport only; no funds or live addresses.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
