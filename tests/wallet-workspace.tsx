import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {WalletWorkspace} from '../components/wallet-workspace';
import type {FinancialStatus} from '../components/use-financial-status';
async function main(){
 const status:FinancialStatus={enabled:true,userId:'owner',capabilities:{transfers:true,deposits:true,withdrawals:false}};
 for(const ar of [true,false])for(const [ownerId,current,expected] of [['owner',true,['available','available','unavailable']],['foreign',true,['unknown','unknown','unknown']],['owner',false,['unknown','unknown','unknown']]] as const){
  const doc=new JSDOM(renderToStaticMarkup(<WalletWorkspace status={status} ownerId={ownerId} current={current} ar={ar}/>)).window.document;
  assert.deepEqual([...doc.querySelectorAll('[data-state]')].map(el=>el.getAttribute('data-state')),expected);
  for(const href of ['/send','/deposit','/withdraw','/settings#active-sessions','/settings#app','/settings/support'])assert(doc.querySelector(`a[href="${href}"]`));
  assert.equal(doc.querySelectorAll('form,button').length,0,'Service overview cannot submit or authorize a payment');
  assert(!doc.body.textContent!.includes('100.00'));assert(!doc.body.textContent!.includes('Verified'));
 }
 const css=await readFile('app/wallet-premium.css','utf8');for(const token of ['prefers-reduced-motion','focus-visible','env(safe-area-inset-bottom)','@media(min-width:1180px)','@media(max-width:360px)'])assert(css.includes(token));assert(!css.includes('backdrop-filter:'));assert(!css.includes('@keyframes'));
 console.log('Wallet workspace PASS: owner/current-capability truth, unknown/stale exclusion, AR/EN real destinations, no payment forms/demo metrics, responsive/focus/reduced-motion design. Presentation fixtures only.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
