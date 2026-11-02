import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const dir='.cache/visual-wallet/screenshots';await mkdir(dir,{recursive:true});
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'&&a!=='--disable-web-security'),headless:true});
const failures=[];
for(const width of [360,390,768,1440])for(const lang of ['ar','en'])for(const screen of ['home','wallet','activity','exchange','deposit','send','withdraw','settings']){
 const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
 page.on('pageerror',e=>failures.push(String(e)));
 await page.goto(`http://127.0.0.1:4173/?screen=${screen}&lang=${lang}`);await page.waitForSelector('main');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
 const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert(layout.scroll<=layout.width+1,`Horizontal overflow: ${screen}/${lang}/${width}: ${JSON.stringify(layout)}`);
 if(width===390)await page.screenshot({path:`${dir}/${screen}-${lang}.png`,fullPage:true});
 if(screen==='settings'){
  assert.equal(await page.locator('.settings-grid').isVisible(),false);
  await page.locator('a[href="#preferences"]').click();await page.waitForTimeout(80);
  assert(await page.locator('#preferences').isVisible());assert.equal(await page.locator('#account-security').isVisible(),false);
  await page.locator('.wallet-page-header button').click();assert(await page.locator('.mobile-settings-menu').isVisible());
 }
 if(screen==='send'){
  await page.locator('.send-route-picker button').first().click();
  await page.locator('.transfer-amount-field input').fill('100');
  await page.locator('button[type="submit"]').click();
  assert.equal(await page.locator('.transfer-amount-field').count(),0);
  await page.locator('form input').fill('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  if(width===390)await page.screenshot({path:`${dir}/send-recipient-${lang}.png`,fullPage:true});
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('.pro-payments>section.card');
  assert.equal(await page.locator('form').count(),0);
  if(width===390)await page.screenshot({path:`${dir}/send-review-${lang}.png`,fullPage:true});
 }
 await page.close();
}
await browser.close();assert.deepEqual(failures,[]);console.log('Browser review PASS: 64 renders (360/390/768/1440 × AR/EN × eight screens), no overflow or runtime errors; settings section routing and amount → recipient → review. Screenshots: '+dir);
