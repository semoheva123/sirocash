import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
async function main(){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://wallet.test/settings#identity-verification',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,self:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 globalThis.fetch=(async(url)=>{assert.equal(url,'/api/identity');return Response.json({available:false,request:null})}) as typeof fetch;
 const {createRoot}=await import('react-dom/client'),{AccountSettings}=await import('../components/account-settings');const root=createRoot(document.getElementById('root')!);const user={id:'fixture-reviewer',email:'fixture@example.test',emailVerifiedAt:'2026-11-05'};
 await act(async()=>root.render(<AccountSettings user={user} canReviewIdentity/>));
 assert.equal(document.querySelector('main')!.getAttribute('data-settings-view'),'identity-verification');const entry=document.querySelector('.identity-review-entry a[href="/identity-review"]');assert(entry,'Personal-document view must offer authorized reviewers a distinct workspace link');assert.equal(entry.closest('.settings-grid'),null);
 await act(async()=>{window.history.replaceState(null,'','/settings');window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'))});assert(document.querySelector('.mobile-settings-menu a[href="/identity-review"]'));assert.equal(document.querySelector('.identity-review-entry'),null);
 await act(async()=>root.render(<AccountSettings user={user}/>));assert.equal(document.querySelectorAll('a[href="/identity-review"]').length,0);await act(async()=>root.unmount());console.log('Identity review navigation interaction PASS: personal upload vs review destinations, hash transition, authorized links outside hidden grid and removed after reviewer authority changes. Mock-only reads.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
