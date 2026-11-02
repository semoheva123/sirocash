/** Scoped record regression: synthetic hashes, no production calls or funds. */
import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const dir='.cache/visual-wallet/screenshots';await mkdir(dir,{recursive:true});
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'&&a!=='--disable-web-security'),headless:true});
const errors=[];
try{
 for(const width of [320,360,375,390,430,768,1440])for(const lang of ['ar','en'])for(const screen of ['deposit','withdraw']){
  const page=await browser.newPage({viewport:{width,height:844}});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.__copied='';window.__failCopy=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.__failCopy)throw Error('Fixture clipboard unavailable');window.__copied=value}}})});
  await page.goto(`http://127.0.0.1:4173/?screen=${screen}&lang=${lang}`);
  const records=page.locator('.financial-records');await records.locator('.financial-record-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const check=async()=>{
   const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,cards:[...document.querySelectorAll('.financial-record-card')].map(el=>({width:el.clientWidth,scroll:el.scrollWidth}))}));
   assert(metrics.scroll<=metrics.width+1,`${screen}/${lang}/${width}: document overflow`);
   for(const card of metrics.cards)assert(card.scroll<=card.width+1,`${screen}/${lang}/${width}: card overflow`);
  };
  await check();
  const first=records.locator('.financial-record-card').first(),reference=screen==='deposit'?'0x'+'a'.repeat(64):'b'.repeat(64);
  assert.equal(await first.locator('.pro-reference>code').innerText(),reference.slice(0,10)+'…'+reference.slice(-8));
  assert(await first.locator('.pro-state').isVisible());assert(await first.locator('time').isVisible());assert(await first.locator('.financial-record-network').isVisible());
  assert((await first.innerText()).includes(screen==='deposit'?'4.99 USDT':'25.123456 USD'));
  await first.getByRole('button',{name:lang==='ar'?'نسخ المرجع':'Copy reference',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copied),reference);
  if(width===390){await records.scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/records-${screen}-${lang}.png`,fullPage:true,animations:'disabled'})}
  await page.evaluate(()=>{window.__failCopy=true});await first.getByRole('button',{name:lang==='ar'?'نسخ المرجع':'Copy reference',exact:true}).click();assert((await first.locator('.pro-copy-feedback').innerText()).includes(lang==='ar'?'تعذّر النسخ':'Copy unavailable'));
  await first.locator('summary').click();assert.equal(await first.locator('details>code').innerText(),reference);assert(await first.locator('details>code').isVisible());await check();
  if(width===390)await page.screenshot({path:`${dir}/records-expanded-${screen}-${lang}.png`,fullPage:true,animations:'disabled'});
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('Records browser PASS: 28 renders (seven widths × AR/EN × deposit/withdrawal), full long hashes, collapsed/expanded layout without overflow, exact copy, copy-failure/manual fallback, visible amount/state/network/date.');
}finally{await browser.close()}
