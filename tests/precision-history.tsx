import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
async function main(){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://wallet.test/activity',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,self:dom.window,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 const {createRoot}=await import('react-dom/client'),{WalletTransactionFeed}=await import('../components/wallet-transaction-feed');
 const id=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'),activity=[{id:id(1),type:'P2P',amount:'-10.123456',status:'COMPLETED',createdAt:'2026-11-05T00:10:00+03:00',senderName:'Test sender',recipientName:'Test recipient'},{id:id(2),type:'DEPOSIT',amount:'1.000001',network:'TRC20',status:'COMPLETED',createdAt:'2026-11-04T22:00:00Z'},{id:id(3),type:'DEPOSIT',amount:'2.000001',network:'BEP20',status:'COMPLETED',createdAt:'2026-11-03T22:00:00Z'}];
 const requests:string[]=[];globalThis.fetch=(async(url,init)=>{assert(!init?.method||init.method==='GET','Presentation may only read history');requests.push(String(url));const query=new URL(String(url),'https://wallet.test').searchParams;return Response.json({userId:'owner',activity:activity.filter(r=>(!query.get('type')||r.type===query.get('type'))&&(!query.get('network')||r.network===query.get('network'))),next:null})}) as typeof fetch;
 const root=createRoot(document.getElementById('root')!);await act(async()=>root.render(<WalletTransactionFeed ar={false} status={{enabled:true,userId:'owner',activity}}/>));
 assert.equal(document.querySelectorAll('.wallet-ledger-day').length,2,'Grouping must use UTC, not the raw source date prefix');assert.equal(requests.length,0);
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-controls="wallet-feed-search"]')!.click());
 const selects=document.querySelectorAll('select');await act(async()=>{selects[0].value='DEPOSIT';selects[0].dispatchEvent(new dom.window.Event('change',{bubbles:true}));selects[1].value='TRC20';selects[1].dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 await act(async()=>document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(requests.length,1);assert.equal(document.querySelectorAll('.wallet-filter-chips button').length,2);assert.equal(document.querySelectorAll('.wallet-transaction-card').length,1);assert(document.body.textContent!.includes('1.000001'));
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Remove Network: TRC20"]')!.click());assert.equal(requests.length,2);assert.equal(document.querySelectorAll('select')[1].value,'','Search form follows the applied filter');assert.equal(document.querySelectorAll('select')[0].value,'DEPOSIT');assert.equal(document.querySelectorAll('.wallet-transaction-card').length,2);
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Remove Type: DEPOSIT"]')!.click());assert.equal(document.querySelectorAll('.wallet-filter-chips button').length,0);assert.equal(document.querySelectorAll('.wallet-transaction-card').length,3);assert.equal(document.querySelectorAll('select')[0].value,'');
 const transfer=[...document.querySelectorAll<HTMLButtonElement>('.wallet-transaction-card')].find(el=>el.textContent!.includes('Internal transfer'))!;await act(async()=>transfer.click());
 const modal=document.querySelector('[role="dialog"]')!;assert(modal.querySelector(`a[href="/transactions/activity/${id(1)}"]`));assert(modal.querySelector(`a[href="/settings/support?reference=${id(1)}"]`));assert(modal.textContent!.includes('-10.123456'));assert.equal(requests.length,2,'Opening local transfer details must not write or request a payment');
 await act(async()=>root.unmount());console.log('Precision history PASS: UTC date groups, exact amounts, explicit global read-only filters, removable chips/form synchronization, exact detail/support navigation. Mock transport only.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
