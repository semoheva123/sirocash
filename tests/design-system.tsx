import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {AccountNavigation} from '../components/account-navigation';
import {SiroApp} from '../components/siro-app';
async function main(){
const routes=['/dashboard','/deposit','/withdraw','/sham-cash','/mobile-topup','/settings'];
for(const ar of [true,false])for(const active of routes){
 const html=renderToStaticMarkup(<AccountNavigation ar={ar} active={active}/>);
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 for(const href of routes)assert.ok(html.includes(`href="${href}"`));
 assert.ok(html.includes(ar?'بيئة تجريبية':'Preview environment'));
 assert.ok(html.includes(ar?'التنقّل الرئيسي للحساب':'Main account navigation'));
}
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
assert.ok(layout.includes('lang="ar" dir="rtl"'));
console.log('Design system: all six navigation destinations/locales, unique active state, account-safe first paint, local fonts, RTL logical layout, reduced motion, keyboard focus and mobile safe-area rules passed.');

}
main();
