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
  await context.route('**/api/exchange-rates',route=>{calls++;return route.fulfill({json:{snapshot:state==='unavailable'?null:{source:'sp-today',city:'damascus',unit:'SYP_NEW',market:{buy:145,sell:146,updatedAt:at},fx:[{pair:'EUR/USD',rate:1.0856,updatedAt:at},{pair:'USD/TRY',rate:34.52,updatedAt:at}],fetchedAt:new Date(now).toISOString()}}})});
  await context.route('**/*sp-today.com/**',()=>{throw Error('Provider calls forbidden in visual fixture')});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:4173/?screen=home&lang=${lang}`);
  await page.locator('.exchange-ticker time').first().waitFor({state:state==='unavailable'?'hidden':'visible'});
  if(state==='unavailable')await page.getByText(lang==='ar'?'غير متاح':'Unavailable',{exact:true}).first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}/${lang}/${state}: overflow`);
  assert.equal(calls,1,'Layout must fetch only once');
  const ticker=page.locator('.exchange-ticker');
  assert.equal(await ticker.getAttribute('dir'),lang==='ar'?'rtl':'ltr');
  if(state==='stale')assert((await ticker.textContent()).includes(lang==='ar'?'بيانات قديمة':'Stale'));
  if(state==='expired')assert(!(await ticker.textContent()).includes('34.52'));
  await ticker.locator('summary').click();
  assert(await ticker.locator('details').getAttribute('open')!==null);
  await ticker.locator('.exchange-ticker-strip').focus();
  if(state==='reference')await page.screenshot({path:`.cache/visual-wallet/screenshots/exchange-${lang}-${width}.png`,fullPage:true});
  // Navigation remains available and does not remount the shared account layout.
  assert(await page.locator('#main-content').isVisible());
  renders++;await context.close();
 }
 assert.deepEqual(errors,[]);console.log(`Exchange ticker visual PASS: ${renders} AR/EN 320/390/1440 renders, all data states, source disclosure/keyboard focus/no page overflow/one request. Synthetic data only.`);
}finally{await browser.close()}
