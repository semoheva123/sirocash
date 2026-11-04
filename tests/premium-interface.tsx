import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {PlatformFooter} from '../components/platform-footer';
import {AccountNavigation} from '../components/account-navigation';
import {ModernLanding} from '../components/modern-landing';
async function main(){
 for(const ar of [true,false]){
  const publicFooter=renderToStaticMarkup(<PlatformFooter ar={ar}/>);
  for(const href of ['/auth','/trust','/support','/privacy','/terms'])assert(publicFooter.includes(`href="${href}"`));
  assert(publicFooter.includes(ar?'لا ترسل أموالًا فعلية':'Do not send real funds'));
  const privateFooter=renderToStaticMarkup(<PlatformFooter ar={ar} account/>);
  for(const href of ['/dashboard','/settings','/support','/trust'])assert(privateFooter.includes(`href="${href}"`));
  assert(privateFooter.includes('premium-footer-compact'));
  for(const active of ['/dashboard','/deposit','/withdraw','/payments','/settings','/sham-cash','/mobile-topup']){
   const nav=renderToStaticMarkup(<AccountNavigation ar={ar} active={active}/>);
   assert.equal((nav.match(/class="premium-nav-group"/g)??[]).length,3);
   assert(nav.includes('href="/support"'));
   assert(nav.includes('pro-mobile-nav'));
  }
  const landing=renderToStaticMarkup(<ModernLanding ar={ar}/>);
  assert(landing.includes('premium-release-note'));
  assert(landing.includes(ar?'حالة الإصدار':'View release status'));
  assert(!/Visa|Mastercard|million customers|licensed globally/i.test(publicFooter+landing));
 }
 const css=await readFile('app/professional.css','utf8');
 for(const rule of ['.premium-nav-group','.premium-footer-grid','.premium-state-actions','prefers-reduced-motion','focus-visible','safe-area-inset-bottom','font-variant-numeric: tabular-nums'])assert(css.includes(rule));
 const app=await readFile('components/siro-app.tsx','utf8');
 assert(app.includes('aria-controls="primary-navigation"'));
 assert(app.includes("event.key==='Escape'"));
 assert(app.includes('menuButton.current?.focus()'));
 const payments=await readFile('components/customer-payments.tsx','utf8');
 assert(payments.includes("status?.enabled===true"));
 assert(payments.includes("status.capabilities?.withdrawals===true"));
 assert(payments.includes("sync==='current'"));
 assert(payments.includes('if(actionLock.current||submitted||!prepared||!canExecute)return'));
 assert(payments.includes('href="/dashboard"'));
 console.log('Premium interface PASS: bilingual grouped navigation, truthful resource footer, availability escape routes, release transparency and retained financial execution/liveness gates.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
