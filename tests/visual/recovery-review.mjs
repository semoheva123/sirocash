/** Synthetic recovery only: never opens production or submits financial requests. */
import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('.cache/visual-wallet/screenshots',{recursive:true});
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'&&a!=='--disable-web-security'),headless:true});
const errors=[];
try{
 for(const width of [320,390,1440])for(const lang of ['ar','en'])for(const screen of ['loading','recovery']){
  const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>assert.equal(r.method(),'GET'));
  await page.goto(`http://127.0.0.1:4173/?screen=${screen}&lang=${lang}`);await page.locator(screen==='recovery'?'h1':'[role="status"]').waitFor();await page.evaluate(()=>document.fonts.ready);
  if(screen==='recovery'){
   const button=page.getByRole('button',{name:lang==='ar'?'إعادة المحاولة':'Retry',exact:true});await button.waitFor();
   await context.setOffline(true);await page.waitForFunction(()=>document.querySelector('button')?.disabled===true);assert((await page.locator('[role="status"]').innerText()).includes(lang==='ar'?'غير متاح':'offline'));
   await context.setOffline(false);await page.waitForFunction(()=>document.querySelector('button')?.disabled===false);
   await page.evaluate(()=>{window.recoveryCounts={reset:0,refresh:0};window.addEventListener('visual-recovery-reset',()=>window.recoveryCounts.reset++);window.addEventListener('visual-recovery-refresh',()=>window.recoveryCounts.refresh++)});
   await button.click();assert.deepEqual(await page.evaluate(()=>window.recoveryCounts),{reset:1,refresh:1});
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
  if(width===390)await page.screenshot({path:`.cache/visual-wallet/screenshots/${screen}-${lang}.png`,fullPage:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Recovery browser PASS: 12 AR/EN renders at 320/390/1440, offline/online feedback, user-only reset/refresh, no document overflow or POST. Test navigation adapter only.');
}finally{await browser.close()}
