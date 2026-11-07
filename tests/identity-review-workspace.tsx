import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
/** Reviewer workspace: password once per visit (memory only), device approval per action, readable dark cards. Mock-only network. */
async function main(){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://wallet.test/identity-review',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,self:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 const calls:Array<{action:string;password:string;approval:string|null}>=[];let approvals=0;let pending=[{id:'req-1',kind:'national_id',expiresAt:null,checks:{ocr:'assist'}},{id:'req-2',kind:'passport',expiresAt:1800000000000,checks:{}}];
 (globalThis as {URL:typeof URL}).URL.createObjectURL=()=>'blob:preview';(globalThis as {URL:typeof URL}).URL.revokeObjectURL=()=>{};
 globalThis.fetch=(async(url,init)=>{
  assert.equal(url,'/api/identity/review');const headers=new Headers(init?.headers);const body=JSON.parse(String(init?.body));
  calls.push({action:body.action,password:body.password,approval:headers.get('x-siro-approval')});
  if(body.password!=='correct horse')return Response.json({error:'تعذّر تأكيد صلاحية المراجع.'},{status:403});
  if(body.action==='list')return Response.json({requests:pending});
  if(body.action==='document')return new Response(new Blob([new Uint8Array([255,216,255])]),{headers:{'Content-Type':'image/jpeg'}});
  pending=pending.filter(r=>r.id!==body.id);return Response.json({ok:true});
 }) as typeof fetch;
 const {createRoot}=await import('react-dom/client'),{IdentityReview}=await import('../components/identity-review');
 const root=createRoot(document.getElementById('root')!);
 const authorize=async()=>{approvals++;return 'a'.repeat(64)};
 await act(async()=>root.render(<IdentityReview authorize={authorize}/>));
 const input=()=>document.querySelector<HTMLInputElement>('#review-password');
 const click=async(text:string)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent===text);assert(b,'missing button '+text);assert(!b.disabled,'button disabled: '+text);await act(async()=>{b.click()})};
 const setValue=async(el:HTMLInputElement,value:string)=>{const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!;await act(async()=>{setter.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})};
 // Locked by default: no requests, no consent checkbox, a single password field.
 assert(input());assert.equal(document.querySelectorAll('.identity-review-list article').length,0);assert.equal(document.querySelector('.identity-consent'),null);
 // Wrong password never unlocks and the field is cleared.
 await setValue(input()!,'wrong');await act(async()=>{document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});
 assert(document.querySelector('[role="alert"]'));assert(input(),'still locked');assert.equal(input()!.value,'');assert.equal(calls.length,1);
 // Correct password opens the workspace once; the password field disappears.
 await setValue(input()!,'correct horse');await act(async()=>{document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});
 assert.equal(input(),null,'password field must disappear after unlocking');assert.equal(document.querySelectorAll('.identity-review-list article').length,2);
 assert(document.querySelector('.identity-review-toolbar'));
 // Consent persists while viewing documents; decisions stay disabled until ticked.
 const approve=()=>[...document.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent==='قبول مراجعة الوثائق');
 assert(approve().every(b=>b.disabled));
 const consent=document.querySelector<HTMLInputElement>('.identity-consent input')!;await act(async()=>{consent.click()});assert(approve().every(b=>!b.disabled));
 await click('عرض الأمام');assert(document.querySelector('img.identity-review-preview'));assert.equal(document.querySelector<HTMLInputElement>('.identity-consent input')!.checked,true,'viewing a document must not reset the human-review confirmation');
 // No password re-entry for subsequent actions, yet every action carries its own device approval and the password server-side.
 await click('قبول مراجعة الوثائق');
 assert.equal(document.querySelectorAll('.identity-review-list article').length,1);assert.equal(document.querySelector<HTMLInputElement>('.identity-consent input')!.checked,false,'a decision resets the confirmation for the next request');
 assert.equal(input(),null,'no password prompt between actions');
 assert.deepEqual(calls.map(c=>c.action),['list','list','document','decision']);assert(calls.slice(1).every(c=>c.password==='correct horse'&&c.approval==='a'.repeat(64)));assert.equal(approvals,4,'device approval remains per action');
 // Nothing persisted outside memory.
 assert.equal(Object.keys(dom.window.localStorage).length,0);assert.equal(dom.window.document.cookie,'');
 // Lock clears everything and asks for the password again.
 await click('قفل');assert(input());assert.equal(document.querySelectorAll('.identity-review-list article').length,0);assert.equal(document.querySelector('img.identity-review-preview'),null);
 await act(async()=>root.unmount());
 console.log('Identity review workspace PASS: password once per visit held in memory only, wrong password stays locked, consent survives document views and resets per decision, device approval per action, lock clears state. Mock-only network.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
