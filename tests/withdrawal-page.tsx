import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {CustomerPayments} from '../components/customer-payments';
const dom=new JSDOM('<div id="root"></div>',{url:'https://wallet.example/withdraw',pretendToBeVisual:true});
Object.assign(globalThis,{self:dom.window,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
localStorage.setItem('siro-language','en');
class Source{
 static current:Source;listeners=new Map<string,(event:{data:string})=>void>();
 constructor(){Source.current=this}close(){}addEventListener(type:string,fn:(event:{data:string})=>void){this.listeners.set(type,fn)}
 snapshot(enabled:boolean,withdrawals:boolean){this.listeners.get('snapshot')!({data:JSON.stringify({enabled,readable:true,userId:'owner',capabilities:{deposits:true,transfers:false,withdrawals},balance:{posted:'100',held:'6'},operations:[{id:'withdrawal',kind:'WITHDRAWAL',amount:'6',feeAmount:'5',state:'RESERVED',createdAt:'2026-11-02'}],deposits:[{id:'deposit',network:'TRC20',txId:'unrelated-deposit-tx',amountBaseUnits:'1000000',state:'CREDITED',createdAt:'2026-11-02'}]})})}
}
Object.assign(globalThis,{EventSource:Source});
let calls=0;
globalThis.fetch=(async()=>{calls++;return Response.json({kind:'WITHDRAWAL',id:'quote',path:'/api/financial/withdraw',payload:{chain:'TRC20',asset:'USDT',amount:'6.000000',fee:'5.000000',netAmount:'1.000000',grossUsd:'5.99'}})}) as typeof fetch;
const root=createRoot(document.getElementById('root')!);
const submit=async()=>act(async()=>{document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});
async function main(){
 await act(async()=>root.render(<CustomerPayments view="withdraw"/>));assert.equal(calls,0);
 await act(async()=>Source.current.snapshot(false,false));
 assert(document.querySelector('form'),'Direct form remains visible while gated');assert(document.querySelector('fieldset')!.disabled);
 assert(document.body.textContent!.includes('Withdrawal history'));assert(document.body.textContent!.includes('Processing'));assert(!document.body.textContent!.includes('unrelated-deposit-tx'));
 assert(!document.querySelector('.deposit-studio'));assert.equal(document.querySelectorAll('select').length,1,'Network only; no command-kind selector');
 for(const word of ['held','ledger','BEFORE YOU PROCEED'])assert(!document.body.textContent!.includes(word));
 await submit();assert.equal(calls,0,'Disabled finance must not even prepare');
 await act(async()=>Source.current.snapshot(true,false));await submit();assert.equal(calls,0,'Withdrawal capability independently required');
 await act(async()=>Source.current.snapshot(true,true));assert(!document.querySelector('fieldset')!.disabled,'Withdrawal must not depend on transfer capability');
 await submit();assert.equal(calls,1);assert(document.body.textContent!.includes('Review command'));assert(document.body.textContent!.includes('Approve with device and confirm'));assert(document.body.textContent!.includes('5.000000'));
 await act(async()=>Source.current.snapshot(true,false));
 const approve=Array.from(document.querySelectorAll('button')).find(b=>b.textContent!.includes('Approve with device'))!;assert(approve.disabled,'Capability loss also disables quote approval');
 await act(async()=>approve.click());assert.equal(calls,1,'No submit/signing under a lost capability');
 await act(async()=>root.unmount());
 console.log('Withdrawal page PASS: direct form plus withdrawal-only history, fixed fee and quote review, independent fail-closed capability gates on prepare and submit, device approval retained. Mock transport only; no authorization or money movement.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
