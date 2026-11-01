import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {PlatformGuide} from '../components/platform-guide';
import {ModernLanding} from '../components/modern-landing';
import {AccountEssentials,AccountAssetCards} from '../components/account-essentials';
import {SignatureVisual} from '../components/signature-visual';
import {AssetSpotlight} from '../components/asset-spotlight';
import {BrandSculpture} from '../components/brand-sculpture';
import {assetNetworks,networks} from '../lib/crypto-assets';
async function main(){
 for(const ar of [true,false]){
  const guide=renderToStaticMarkup(<PlatformGuide ar={ar}/>);
  assert.equal((guide.match(/<details>/g)||[]).length,4);
  assert.equal((guide.match(/<summary>/g)||[]).length,4);
  for(const href of ['/trust','/support'])assert.ok(guide.includes(`href="${href}"`));
  assert.ok(guide.includes(ar?'لا ترسل أموالًا':'Do not send funds'));
  assert.ok(guide.includes('aria-labelledby="world-faq-title"'));
  const landing=renderToStaticMarkup(<ModernLanding ar={ar}/>);
  for(const anchor of ['main-content','business','how-it-works','security'])assert.ok(landing.includes(`id="${anchor}"`));
  for(const href of ['/auth','/dashboard','/deposit','/sham-cash','/mobile-topup','/trust'])assert.ok(landing.includes(`href="${href}"`));
  assert.ok(landing.includes(ar?'كل ما تحتاجه.':'Your whole world.'));
  assert.ok(landing.includes(ar?'الخدمات المالية الفعلية غير مفعّلة':'Live financial services are not activated'));
  assert.ok(!/SC-8901|2,450.75|\$12.50|Visa|Mastercard/.test(landing));
  const art=renderToStaticMarkup(<SignatureVisual ar={ar}/>);
  assert.ok(art.includes('fintech-phone'));
  assert.equal((art.match(/aria-pressed="true"/g)||[]).length,1);
  assert.ok(!art.includes('signature-metal-card'));
  const spotlight=renderToStaticMarkup(<AssetSpotlight ar={ar}/>);
  assert.equal((spotlight.match(/aria-pressed="true"/g)||[]).length,1);
  assert.equal((spotlight.match(/aria-pressed="false"/g)||[]).length,1);
  for(const network of assetNetworks.USDT)assert.ok(spotlight.includes(networks[network].name));
  assert.ok(spotlight.includes('/deposit?asset=USDT'));
  assert.ok(spotlight.includes(ar?'خيارات تجريبية':'Preview only'));
  assert.ok(!/APR|APY|0%|Visa|Mastercard/.test(spotlight));
  const assets=renderToStaticMarkup(<AccountAssetCards ar={ar}/>);
  assert.ok(assets.includes('/deposit?asset=USDC'));
  assert.ok(assets.includes('/deposit?asset=USDT'));
  assert.ok(assets.includes(ar?'لا تمثّل حيازات حسابك':'Not account holdings'));
  for(const state of [{verified:true,loading:false,error:false},{verified:false,loading:false,error:false},{verified:true,loading:true,error:false},{verified:true,loading:false,error:true}]){
   const html=renderToStaticMarkup(<AccountEssentials ar={ar} {...state}/>);
   const expected=state.loading?(ar?'جارٍ التحقق…':'Checking…'):state.error?(ar?'غير متاح':'Unavailable'):state.verified?(ar?'تم التحقق':'Verified'):(ar?'لم يتم التحقق':'Not verified');
   assert.ok(html.includes(expected));
   if(state.loading||state.error||!state.verified)assert.ok(html.includes('class="fintech-neutral-status"'));
   assert.ok(html.includes(ar?'غير مفعّلة':'Not activated'));
  }
 }
 const artwork=renderToStaticMarkup(<><BrandSculpture/><BrandSculpture/></>);
 const ids=[...artwork.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,6);assert.equal(new Set(ids).size,6);
 assert.equal((artwork.match(/aria-hidden="true"/g)||[]).length,2);
 const layout=await readFile('app/layout.tsx','utf8');
 assert.ok(layout.indexOf('./fintech.css')>layout.indexOf('./atelier.css'));
 const css=await readFile('app/fintech.css','utf8');
 for(const rule of ['color-scheme: light','fintech-bento-transfer','fintech-account-essentials','safe-area','prefers-reduced-motion']){
  // Bottom navigation safe areas remain in the underlying shared layout.
  assert.ok((rule==='safe-area'?await readFile('app/design-system.css','utf8'):css).includes(rule));
 }
 console.log('Modern fintech: new bilingual composition, interactive app preview, truthful availability, no fake payment-card/balance/activity claims, asset deep links, neutral loading/error verification states and light-theme accessibility contracts passed.');
}
main();
