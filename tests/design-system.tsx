import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {AccountNavigation} from '../components/account-navigation';
import {SignatureVisual} from '../components/signature-visual';
import {AccountSettings} from '../components/account-settings';
import {SiroApp} from '../components/siro-app';
async function main(){
const routes=['/dashboard','/wallet','/activity','/deposit','/withdraw','/sham-cash','/mobile-topup','/settings'];
for(const ar of [true,false])for(const active of routes){
 const html=renderToStaticMarkup(<AccountNavigation ar={ar} active={active}/>);
 const navs=[...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)].map(m=>m[1]);
 assert.equal((navs[0].match(/aria-current="page"/g)||[]).length,1);
 assert.equal((navs[1].match(/aria-current="page"/g)||[]).length,1);
 for(const href of routes)assert.ok(html.includes(`href="${href}"`));
 assert.ok(html.includes('SIRO CASH'));
 assert.ok(!html.includes('No real funds'),'Member navigation must not misrepresent real funded deposits');
 assert.ok(html.includes(ar?'التنقّل الرئيسي للحساب':'Main account navigation'));
}
for(const ar of [true,false]){
 const art=renderToStaticMarkup(<SignatureVisual ar={ar}/>);
 assert.ok(art.includes(ar?'ليست بطاقة دفع':'Not a payment card'));
 assert.ok(art.includes(ar?'دون تسوية فعلية':'No live settlement'));
 assert.ok(art.includes('USDT')&&art.includes('USDC'));
 assert.ok(!art.includes('2,450.75'));
}
const settings=renderToStaticMarkup(<AccountSettings user={{id:'11111111-2222-4333-8444-555555555555',email:'design@example.test',emailVerifiedAt:'2026-10-30'}}/>);
for(const id of ['preferences','password-change','active-sessions','identity-verification']){
 assert.ok(settings.includes(`href="#${id}"`));
 // Network-backed panels mount only after explicit section selection.
 assert.equal(settings.includes(`id="${id}"`),!['active-sessions','identity-verification'].includes(id));
}
const signatureCss=await readFile('app/signature.css','utf8');
for(const rule of ['prefers-reduced-motion','.signature-scene','.signature-settings-index','.receive-card','.dashboard-balance'])assert.ok(signatureCss.includes(rule));
const dashboard=renderToStaticMarkup(<SiroApp page="dashboard"/>);
assert.ok(dashboard.includes('account-workspace'));
assert.ok(dashboard.includes('balance-privacy'));
assert.ok(dashboard.includes('workspace-services'));
assert.ok(dashboard.includes('empty-illustration'));
// First paint must not substitute guest balances/identity while waiting for the verified account.
assert.ok(!dashboard.includes('2,450.75'));
assert.ok(!dashboard.includes('SC-8901'));
const css=await readFile('app/design-system.css','utf8');
for(const rule of ['inset-inline-start','padding-inline-start','prefers-reduced-motion','safe-area-inset-bottom','focus-visible','.service-unavailable'])assert.ok(css.includes(rule));
const layout=await readFile('app/layout.tsx','utf8');
assert.ok(layout.includes('@fontsource-variable/noto-sans-arabic'));
assert.ok(layout.includes('@fontsource-variable/manrope'));
assert.ok(layout.indexOf('./signature.css')>layout.indexOf('./design-system.css'));
assert.ok(layout.includes("get('siro-language')?.value==='en'?'en':'ar'"));
assert.ok(layout.includes("lang={language} dir={language==='ar'?'rtl':'ltr'}"));
console.log('Design system: all six navigation destinations/locales, unique active state, account-safe first paint, local fonts, RTL logical layout, reduced motion, keyboard focus and mobile safe-area rules passed.');

}
main();
