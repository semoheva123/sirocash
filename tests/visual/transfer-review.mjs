/** Synthetic participants/committed receipt only. No authorization or transfer POST. */
import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('.cache/visual-wallet/screenshots',{recursive:true});
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'&&a!=='--disable-web-security'),headless:true});
const errors=[];
try{
 for(const width of [320,390,1440])for(const lang of ['ar','en'])for(const screen of ['activity','transfer-receipt']){
  const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{assert.equal(r.method(),'GET','No financial/auth POST permitted')});
  await page.goto(`http://127.0.0.1:4173/?screen=${screen}&lang=${lang}`);
  const panel=page.locator(screen==='activity'?'.transfer-parties':'.transfer-success').first();await panel.waitFor();await page.evaluate(()=>document.fonts.ready);
  assert((await panel.innerText()).includes('9876543217'));
  if(screen==='activity'){assert((await panel.innerText()).includes('1234567897'));assert((await panel.innerText()).includes(lang==='ar'?'المرسل':'Sender'))}
  else assert((await panel.innerText()).includes(lang==='ar'?'وصل المبلغ إلى حساب المستفيد':'recipient account has been credited'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document overflow');
  if(width===390)await page.screenshot({path:`.cache/visual-wallet/screenshots/transfer-${screen}-${lang}.png`,fullPage:true});
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('Transfer browser PASS: 12 AR/EN mobile/desktop renders; named parties/UID, visible committed-credit confirmation, no document overflow, no auth/financial POST. Synthetic only.');
}finally{await browser.close()}
