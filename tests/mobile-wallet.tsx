import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {MobileWallet} from '../components/mobile-wallet';
import {AccountNavigation} from '../components/account-navigation';
import {DeliveryMethods,type DeliveryMethod} from '../components/delivery-methods';
import {previewInternalTransfer} from '../lib/transfer-preview';
import {internalTransferQuote} from '../lib/wallet-engine';
for(const amount of ['100','1','0.000001','0.000099','99999.999999']){
 const preview=previewInternalTransfer(amount)!,server=internalTransferQuote(amount);
 for(const key of ['amount','fee','totalDebit'] as const)assert.equal(preview[key],server[key]);
}
for(const amount of ['0','-1','100001','NaN','1e2','0.0000001'])assert.equal(previewInternalTransfer(amount),null);
const dom=new JSDOM('<div id="root"></div>',{url:'https://wallet.example/dashboard',pretendToBeVisual:true});
Object.assign(globalThis,{self:dom.window,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
localStorage.setItem('siro-language','en');
class Source{
 static current:Source;listeners=new Map<string,(e:{data:string})=>void>();
 constructor(){Source.current=this}close(){}addEventListener(type:string,fn:(e:{data:string})=>void){this.listeners.set(type,fn)}
 snapshot(posted='100',held='6',userId='owner'){this.listeners.get('snapshot')!({data:JSON.stringify({enabled:true,readable:true,userId,balance:{posted,held},capabilities:{transfers:false,withdrawals:false,deposits:true},activity:[{id:'incoming',type:'DEPOSIT',amount:'4.981691',status:'COMPLETED',createdAt:'2026-11-02T20:00:00Z'}]})})}
}
Object.assign(globalThis,{EventSource:Source});
let calls=0;globalThis.fetch=(async(url)=>{if(url==='/api/account/receiving-identity')return Response.json({userId:'owner',identity:{uid:'1234567897',displayName:'Owner',username:null,identityVerified:false}});calls++;throw Error('Unexpected financial request')}) as typeof fetch;
const root=createRoot(document.getElementById('root')!);
const balance=()=>document.querySelector('.mobile-balance-value strong')!.textContent!;
function Methods(){const [method,setMethod]=useState<DeliveryMethod>('internal');return <DeliveryMethods ar={false} value={method} onChange={setMethod}/>}
async function main(){
 await act(async()=>root.render(<MobileWallet ownerId="owner"/>));
 assert(balance().includes('••••••'));assert(document.body.textContent!.includes('Welcome to Siro Cash'));
 const nav=document.querySelector('.pro-mobile-nav')!;
 assert.deepEqual(Array.from(nav.querySelectorAll('a')).map(a=>a.getAttribute('href')),['/dashboard','/wallet','/activity','/settings']);
 assert.equal(nav.querySelector('[aria-current="page"]')!.getAttribute('href'),'/dashboard');
 const actions=document.querySelector('.wallet-actions')!;
 assert.deepEqual(Array.from(actions.children).map(e=>e.textContent),['Send','Receive','Deposit','Exchange']);
 assert.equal(actions.querySelector('a')!.getAttribute('href'),'/send');
 await act(async()=>Source.current.snapshot());
 assert(document.querySelector('.mobile-recent time'));assert(document.body.textContent!.includes('4.981691'));
 const eye=()=>document.querySelector<HTMLButtonElement>('.mobile-balance-value button')!;
 await act(async()=>eye().click());assert.equal(balance(),'94.00 USD');
 await act(async()=>Source.current.snapshot('100','10'));assert.equal(balance(),'90.00 USD');
 await act(async()=>Source.current.snapshot('90','0'));assert.equal(balance(),'90.00 USD','Settlement does not double-debit');
 await act(async()=>Source.current.snapshot('100','0'));assert.equal(balance(),'100.00 USD','Release restores spendable total');
 assert.equal(document.querySelectorAll('.mobile-balance').length,1);
 await act(async()=>eye().click());assert(balance().includes('••••••'));
 await act(async()=>root.render(<MobileWallet ownerId="owner" view="wallet"/>));assert(document.querySelector('.wallet-service-grid a[href="/withdraw"]'));
 await act(async()=>root.render(<MobileWallet ownerId="owner" view="exchange"/>));assert(document.body.textContent!.includes('coming soon'));assert.equal(document.querySelectorAll('form').length,0);
 await act(async()=>root.render(<MobileWallet ownerId="owner"/>));await act(async()=>eye().click());
 await act(async()=>Source.current.snapshot('900000','0','someone-else'));assert.equal(balance(),'— USD','Owner replacement cannot display another balance');
 await act(async()=>root.render(<Methods/>));
 for(const label of ['Cash hand-delivery','Al Haram & Al Fouad networks']){
  const option=Array.from(document.querySelectorAll('button')).find(b=>b.textContent!.includes(label))!;
  await act(async()=>option.click());assert(document.querySelector('fieldset')!.disabled);assert.equal(document.querySelectorAll('input').length,5);assert(!document.querySelector('button[type="submit"]'));assert(document.body.textContent!.includes('No request can be submitted'));
 }
 await act(async()=>root.unmount());assert.equal(calls,0,'Read-only pages and unavailable delivery rails cannot call money endpoints');
 for(const ar of [true,false]){
  const html=renderToStaticMarkup(<AccountNavigation active="/settings" ar={ar}/>);const page=new JSDOM(html).window.document;
  assert.equal(page.querySelectorAll('.pro-mobile-nav a').length,4);assert.equal(page.querySelector('.pro-mobile-nav [aria-current="page"]')!.getAttribute('href'),'/settings');
 }
 console.log('Mobile wallet PASS: four destinations plus send-sheet action, exact quick-action order, default privacy, live available balance and release/settlement, owner isolation, real activity, disabled delivery/exchange rails, bilingual navigation, exact preview/server fee parity. Mock only; no funds.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
