import assert from 'node:assert/strict';
import React,{act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {FinancialRecords} from '../components/financial-records';
import {CustomerPayments} from '../components/customer-payments';
import {transactionExplorer} from '../lib/transaction-explorer';
import {withdrawalReceiptState} from '../lib/withdrawal-receipt';
import type {FinancialStatus} from '../components/use-financial-status';
const tx='a'.repeat(64),id='00000000-0000-0000-0000-000000000001',quote='00000000-0000-0000-0000-000000000002';
for(const state of ['RESERVED','SUBMITTED','COMPLETED','FAILED'] as const)assert.equal(withdrawalReceiptState({operation:{id,state},quote:{id:quote}},quote),state);
for(const result of [null,{},true,{operation:{id,state:'UNKNOWN'},quote:{id:quote}},{operation:{id:'bad',state:'COMPLETED'},quote:{id:quote}},{operation:{id,state:'COMPLETED'},quote:{id:'foreign'}}])assert.equal(withdrawalReceiptState(result,quote),null);
assert.equal(transactionExplorer('TRC20',tx),`https://tronscan.org/#/transaction/${tx}`);
assert.equal(transactionExplorer('BEP20','0x'+tx),`https://bscscan.com/tx/0x${tx}`);
for(const [network,hash] of [['TRC20','javascript:alert(1)'],['OTHER',tx],['BEP20',tx],['TRC20','0x'+tx],['BEP20','0x'+tx+'?redirect=https://evil.test']])assert.equal(transactionExplorer(network,hash),null);
const status:FinancialStatus={enabled:true,userId:'owner',capabilities:{withdrawals:true,deposits:true},operations:[{id,kind:'WITHDRAWAL',amount:'5.98',feeAmount:'0',network:'TRC20',recipient:'saved-recipient',grossTokens:'6',feeTokens:'5',netTokens:'1',state:'SUBMITTED',createdAt:'2026-11-04'}],payouts:[{id:'payout',operationId:id,network:'TRC20',txId:tx,sender:'saved-sender',recipient:'saved-recipient',amountBaseUnits:'1000000',state:'CONFIRMED',createdAt:'2026-11-04'}],deposits:[{id:'deposit',network:'BEP20',txId:'0x'+tx,recipient:'deposit-recipient',amountBaseUnits:'1000000000000000001',state:'AWAITING_VALUATION',createdAt:'2026-11-04'}]};
for(const ar of [true,false]){
 const withdrawal=renderToStaticMarkup(<FinancialRecords status={status} ar={ar} scope="withdrawals"/>);
 for(const text of ['saved-sender','saved-recipient','1 USDT','6 USDT','5 USDT','5.98','tronscan.org',ar?'حالة طلب السحب':'Withdrawal request status',ar?'مؤكدة على الشبكة':'Confirmed on chain',ar?'بانتظار التسوية':'Awaiting settlement'])assert(withdrawal.includes(text),text);
 assert(!withdrawal.includes('deposit-recipient'));assert(!withdrawal.includes('bscscan.com'));
 const deposit=renderToStaticMarkup(<FinancialRecords status={status} ar={ar} scope="deposits"/>);
 for(const text of ['deposit-recipient','1.000000000000000001 USDT','bscscan.com',ar?'غير متاح في السجل':'Not available in this record'])assert(deposit.includes(text),text);
 assert(!deposit.includes('saved-sender'));assert(!deposit.includes(ar?'أُضيفت إلى الرصيد':'Credited'));assert(!deposit.includes('tronscan.org'));
 const identified=renderToStaticMarkup(<FinancialRecords status={{...status,deposits:status.deposits!.map(d=>({...d,sender:'verified-transfer-event-source'}))}} ar={ar} scope="deposits"/>);assert(identified.includes('verified-transfer-event-source'));
 const pending=renderToStaticMarkup(<FinancialRecords status={{...status,payouts:[]}} ar={ar} scope="withdrawals"/>);
 assert(pending.includes('saved-recipient'));assert(!pending.includes('tronscan.org'));assert(pending.includes(ar?'لم يتوفر بعد':'Not available yet'));
}
const dom=new JSDOM('<div id="root"></div>',{url:'https://wallet.example/withdraw',pretendToBeVisual:true});
Object.assign(globalThis,{self:dom.window,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});localStorage.setItem('siro-language','en');
class Source{static current:Source;listeners=new Map<string,(e:{data:string})=>void>();constructor(){Source.current=this}close(){}addEventListener(k:string,f:(e:{data:string})=>void){this.listeners.set(k,f)}snapshot(){this.listeners.get('snapshot')!({data:JSON.stringify({...status,readable:true})})}}
Object.assign(globalThis,{EventSource:Source});
const root=createRoot(document.getElementById('root')!);
async function main(){
 let copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{copied=value}}});
 await act(async()=>root.render(<FinancialRecords status={status} ar={false} scope="withdrawals"/>));
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Copy Sender wallet"]')!.click());assert.equal(copied,'saved-sender');assert(document.body.textContent!.includes('Copied'));
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Denied')}}});
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Copy Sender wallet"]')!.click());assert(document.body.textContent!.includes('Copy unavailable'));assert(!document.body.textContent!.includes('Copied'));
 let release!:(response:Response)=>void;const bodies:string[]=[];
 globalThis.fetch=(async(url,init)=>{assert.equal(url,'/api/financial/prepare');bodies.push(String(init?.body));return new Promise<Response>(resolve=>release=resolve)}) as typeof fetch;
 await act(async()=>root.render(<CustomerPayments view="withdraw"/>));await act(async()=>Source.current.snapshot());
 const send=()=>document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 await act(async()=>{send();send()});assert.equal(bodies.length,1,'Synchronous guard blocks double submission before React commits disabled state');assert(document.querySelector('.action-notice-busy'));
 await act(async()=>release(Response.json({error:'Fixture failure'},{status:400})));assert(document.querySelector('[role="alert"]')!.textContent!.includes('Fixture failure'));assert(!document.querySelector('.action-notice-busy'));
 await act(async()=>send());assert.equal(bodies.length,2);assert.equal(JSON.parse(bodies[0]).requestKey,JSON.parse(bodies[1]).requestKey,'Failed preparation does not silently rotate request identity');
 await act(async()=>release(Response.json({kind:'WITHDRAWAL',id:quote,path:'/api/wallet/withdraw',payload:{amount:'6',fee:'5',netAmount:'1'}})));
 assert(document.body.textContent!.includes('Quote ready for review; no payment has been submitted.'));assert(!document.querySelector('.action-notice-success'));
 await act(async()=>root.unmount());
 console.log('Wallet feedback PASS: bilingual owner snapshot records, exact TRC20/BEP20 decimals, saved addresses and real fees, chain/account state distinction, safe explorer URLs, honest missing sender/hash, clipboard success/failure, duplicate-click lock, preserved retry key, preparation not payment success. Offline fixtures only.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
