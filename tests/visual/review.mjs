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
 if(width===390)await page.screenshot({path:`${dir}/${screen}-${lang}.png`,fullPage:true,animations:'disabled'});
 if(screen==='home'){
  assert(await page.locator('.wallet-service-grid').isVisible());
  await page.locator('.wallet-actions a[href="/send"]').click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.locator('.sheet-route-list a').count(),2);
  if(width===390)await page.screenshot({path:`${dir}/send-sheet-${lang}.png`,fullPage:true,animations:'disabled'});
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  assert(await page.locator('.wallet-actions a[href="/send"]').evaluate(el=>el===document.activeElement));
 }
 if(screen==='activity'){
  const tabs=page.locator('.wallet-feed-tabs button'),cards=page.locator('.wallet-transaction-card');
  await tabs.nth(1).click();assert.equal(await cards.count(),1);assert(await cards.first().evaluate(el=>el.classList.contains('direction-incoming')));
  await tabs.nth(2).click();assert.equal(await cards.count(),2);assert.equal(await page.locator('.direction-incoming').count(),0);
  await tabs.nth(3).click();assert.equal(await cards.count(),1);assert((await cards.first().innerText()).includes('20.00'));
  await cards.first().click();assert((await page.getByRole('dialog').innerText()).includes('fixture-withdraw'));
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await tabs.first().click();await page.locator('.wallet-feed-heading button').click();await page.locator('input[type="search"]').fill('fixture-transfer');assert.equal(await cards.count(),1);
 }
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
  await page.locator('form input').fill('١٢٣٤ ٥٦٧٨ ٩٧');
  if(width===390)await page.screenshot({path:`${dir}/send-recipient-${lang}.png`,fullPage:true,animations:'disabled'});
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('.pro-payments>section.card');
  assert.equal(await page.locator('form').count(),0);
  assert(await page.locator('.recipient-identity-card').isVisible());
  assert((await page.locator('.recipient-identity-card').innerText()).includes('1234 5678 97'));
  assert.equal(await page.locator('.identity-verified').count(),0);
  if(width===390)await page.screenshot({path:`${dir}/send-review-${lang}.png`,fullPage:true,animations:'disabled'});
 }
 await page.close();
}
for(const width of [360,390,768,1440])for(const lang of ['ar','en']){
 const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>failures.push(String(e)));
 let execution=0;page.on('request',req=>{if(/\/api\/financial\/(prepare|transfer|withdraw)$/.test(req.url()))execution++});
 await page.goto(`http://127.0.0.1:4173/?screen=send&route=external&lang=${lang}`);await page.locator('.remittance-method-trigger').waitFor();
 assert(await page.locator('.remittance-next').isDisabled());
 await page.locator('.remittance-method-trigger').click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.remittance-method-list button').count(),3);
 if(width===390)await page.screenshot({path:`${dir}/external-methods-${lang}.png`,fullPage:true,animations:'disabled'});
 const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(layout.scroll<=layout.width+1);
 await page.locator('.remittance-method-list button').nth(2).click();assert.equal(await page.getByRole('dialog').count(),0);assert(await page.locator('.remittance-next').isDisabled());assert.equal(execution,0);
 if(width===390)await page.screenshot({path:`${dir}/external-form-${lang}.png`,fullPage:true,animations:'disabled'});
 await page.close();
}
await browser.close();assert.deepEqual(failures,[]);console.log('Browser review PASS: 72 renders (eight base screens plus external remittance × four widths × AR/EN), no overflow or runtime errors; signed filters/search/details, sheet Escape/focus return, visible services, blocked external methods, settings section routing and amount → recipient → review. Screenshots: '+dir);
