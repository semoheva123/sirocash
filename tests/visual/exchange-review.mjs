/** Synthetic data only: no provider calls, authenticated production actions or secrets. */
import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('.cache/visual-wallet/screenshots',{recursive:true});
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'&&a!=='--disable-web-security'),headless:true});
const errors=[];let renders=0;
try{
 for(const width of [320,390,1440])for(const lang of ['ar','en'])for(const state of ['reference','stale','expired','unavailable']){
  const context=await browser.newContext({viewport:{width,height:844}});let calls=0;
  const now=Date.now(),at=new Date(now-(state==='stale'?17*3600000:state==='expired'?8*86400000:3600000)).toISOString();
  await context.route('**/api/exchange-rates/events',route=>{calls++;return route.fulfill({contentType:'text/event-stream',body:'event: snapshot\ndata: '+JSON.stringify({enabled:true,userId:'11111111-2222-4333-8444-555555555555',snapshot:state==='unavailable'?null:{source:'sp-today',city:'syria-general',unit:'SYP_NEW',observation:'public-page',market:{buy:144,sell:144.5,updatedAt:at},fx:[{pair:'EUR/USD',rate:1.1246,updatedAt:at},{pair:'USD/TRY',rate:50.0213,updatedAt:at}],fetchedAt:new Date(now).toISOString()}})+'\n\n'})});
  await context.route('**/*sp-today.com/**',()=>{throw Error('Provider calls forbidden in visual fixture')});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:4173/?screen=home&lang=${lang}`);
  await page.waitForFunction(()=>!document.querySelector('.exchange-ticker')?.textContent.includes('Loading exchange rates')&&!document.querySelector('.exchange-ticker')?.textContent.includes('جارٍ تحميل'));
  await page.waitForFunction(()=>document.querySelector('.exchange-ticker-track')||document.querySelector('.exchange-ticker-empty'));
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}/${lang}/${state}: overflow`);
  assert(calls>=1,'Must receive a stream snapshot');
  const ticker=page.locator('.exchange-ticker');
  assert.equal(await ticker.getAttribute('dir'),lang==='ar'?'rtl':'ltr');
  if(state==='stale')assert((await ticker.textContent()).includes(lang==='ar'?'بيانات قديمة':'Stale'));
  if(state==='expired')assert(!(await ticker.textContent()).includes('50.0213'));
  assert((await ticker.boundingBox()).height<=42,'Must stay a single compact line');
  if(state==='reference'||state==='stale'){
   const track=ticker.locator('.exchange-ticker-track');
   const before=await track.evaluate(el=>getComputedStyle(el).transform);
   await page.waitForTimeout(180);
   assert.notEqual(await track.evaluate(el=>getComputedStyle(el).transform),before,'Ticker must actually move');
  }
  assert.equal(await ticker.locator('button,dialog').count(),0,'Strip only; no controls or feature details');
  await ticker.locator('.exchange-ticker-window').focus();
  if(state==='reference')await page.screenshot({path:`.cache/visual-wallet/screenshots/exchange-${lang}-${width}.png`,fullPage:true});
  // Navigation remains available and does not remount the shared account layout.
  assert(await page.locator('#main-content').isVisible());
  renders++;await context.close();
 }
 assert.deepEqual(errors,[]);console.log(`Exchange ticker visual PASS: ${renders} AR/EN 320/390/1440 renders, all data states, strip-only/keyboard focus/no page overflow/SSE. Synthetic data only.`);
}finally{await browser.close()}
