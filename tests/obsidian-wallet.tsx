import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {WalletActions} from '../components/wallet-actions';
import {receiveDetails,withdrawalPrefill,withdrawalReviewHref} from '../lib/wallet-presentation';
const owner='11111111-2222-4333-8444-555555555555';
const address='0x'+'1'.repeat(40);
const status={userId:owner,enabled:false,readable:true,addresses:[{network:'BEP20',address}]};
async function main(){
 assert.deepEqual(receiveDetails(status,owner,'account','TRC20'),{value:owner,qr:'sirocash:pay:'+owner});
 assert.equal(receiveDetails(status,'foreign-owner','account','TRC20'),null);
 assert.equal(receiveDetails(null,owner,'account','TRC20'),null);
 assert.equal(receiveDetails({...status,readable:false},owner,'crypto','BEP20'),null);
 assert.equal(receiveDetails(status,owner,'crypto','TRC20'),null);
 assert.deepEqual(receiveDetails(status,owner,'crypto','BEP20'),{value:address,qr:address});
 assert.equal(receiveDetails({...status,addresses:[{network:'BEP20',address:'malformed'}]},owner,'crypto','BEP20'),null);
 const href=withdrawalReviewHref(address,'1.123456','BEP20');
 assert.deepEqual(withdrawalPrefill(new URL(href,'https://example.test').searchParams),{chain:'BEP20',recipient:address,amount:'1.123456'});
 for(const amount of ['0','-1','1.1234567','1e6','NaN','Infinity','100000000000000'])assert.throws(()=>withdrawalReviewHref(address,amount,'BEP20'),/INVALID_AMOUNT/);
 assert.throws(()=>withdrawalReviewHref('wrong','1','TRC20'),/INVALID_ADDRESS/);
 assert.deepEqual(withdrawalPrefill(new URLSearchParams('kind=WITHDRAWAL&chain=arbitrary&recipient=javascript:alert(1)&amount=Infinity')),{chain:'TRC20',recipient:'',amount:''});
 for(const ar of [true,false]){
  const html=renderToStaticMarkup(<WalletActions ar={ar} ownerId={owner} status={status} current/>);
  assert(html.includes(ar?'إرسال':'Send'));assert(html.includes(ar?'استلام':'Receive'));
  assert(html.includes('href="/deposit"'));assert(html.includes('href="/withdraw"'));
  assert(!html.includes('SC-8901'));
 }
 const actions=await readFile('components/wallet-actions.tsx','utf8');
 assert(!actions.includes('fetch('));assert(!actions.includes('authorizePayment('));
 assert(actions.includes('owned.capabilities?.withdrawals'));
 assert(actions.includes("notify('info'"));assert(actions.includes("notify('success'"));
 assert(actions.indexOf('await navigator.clipboard.writeText')<actions.indexOf("notify('success'"));
 const css=await readFile('app/obsidian.css','utf8');
 for(const rule of ['#09090b','backdrop-filter: blur','obsidian-dialog-in','obsidian-toast-in','safe-area-inset-bottom','prefers-reduced-motion','prefers-reduced-transparency'])assert(css.includes(rule));
 const layout=await readFile('app/layout.tsx','utf8');assert(layout.includes('data-theme="obsidian"'));assert(layout.indexOf('./obsidian.css')>layout.indexOf('./professional.css'));
 console.log('Obsidian wallet PASS: owner-bound receive QR, no invented addresses, exact-decimal review handoff, hostile prefill rejected, disabled execution cannot submit, copy success only after clipboard, accessible theme contracts.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
