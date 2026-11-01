import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {ServiceBrief} from '../components/service-brief';
import {ExperienceSection} from '../components/experience-section';
import {TrustDocument} from '../components/trust-document';
import {WorkspaceSearch} from '../components/workspace-search';
import NotFound from '../app/not-found';

async function main(){
 for(const ar of [true,false]){
  for(const service of ['deposit','withdraw','sham-cash','mobile-topup'] as const){
   const html=renderToStaticMarkup(<ServiceBrief service={service} ar={ar}/>);
   assert.ok(html.includes(ar?'لم تُعتمد الرسوم التشغيلية بعد':'Live fees are not approved'));
   assert.ok(html.includes(ar?'إصدار تجريبي':'Preview only'));
   assert.ok(!html.includes('$0.00'));
   if(service==='sham-cash'){
    assert.ok(html.includes(ar?'من ساعة إلى 24 ساعة':'1–24 hours'));
    assert.ok(html.includes(ar?'لم يُنشر جدول أيام وساعات العمل بعد':'The operating calendar has not been published'));
   }
  }
  const experience=renderToStaticMarkup(<ExperienceSection ar={ar}/>);
  assert.equal((experience.match(/aria-pressed="true"/g)||[]).length,1);
  assert.equal((experience.match(/aria-pressed="false"/g)||[]).length,2);
  assert.ok(experience.includes('id="workspace-illustration"'));
  assert.ok(experience.includes(ar?'ليس حسابًا ماليًا فعليًا':'not a live financial account'));
  assert.ok(!/2,450|SC-8901|visual-review@example/.test(experience));
  const navigation=renderToStaticMarkup(<WorkspaceSearch ar={ar}/>);
  assert.ok(navigation.includes(ar?'انتقال سريع':'Quick access'));
  assert.ok(!navigation.includes('role="dialog"'));
 }
 for(const kind of ['trust','privacy','terms','support'] as const){
  const html=renderToStaticMarkup(<TrustDocument kind={kind} title="بيان تجريبي" subtitle="وصف"><p>المحتوى</p></TrustDocument>);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  assert.ok(html.includes('id="main-content"'));
  assert.ok(html.includes('لا تمثّل ترخيصًا'));
 }
 const missing=renderToStaticMarkup(<NotFound/>);
 assert.ok(missing.includes('href="/support"'));
 assert.ok(missing.includes('الصفحة غير موجودة'));
 const css=await readFile('app/atelier.css','utf8');
 for(const rule of ['prefers-reduced-motion','focus-visible','inset-inline-start','atelier-service-brief','atelier-document-hero','atelier-recovery-layout','atelier-skip:focus'])assert.ok(css.includes(rule));
 const layout=await readFile('app/layout.tsx','utf8');
 assert.ok(layout.includes('href="#main-content"'));
 assert.ok(!layout.includes('Instant transfers'));
 console.log('Atelier design: bilingual service disclosures, 1–24-hour Sham Cash window without invented calendar/fees, honest interactive preview, active document navigation, quick-access first paint, accessible destinations and reduced motion passed.');
}
main();
