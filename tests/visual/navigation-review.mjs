import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'&&a!=='--disable-web-security'),headless:true});
try{
 for(const width of [360,1440]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
  window.__streams=[];
  window.EventSource=class {
   listeners={};closed=false;
   constructor(){window.__streams.push(this)}
   addEventListener(name,fn){(this.listeners[name]??=[]).push(fn)}
   close(){this.closed=true}
   emit(name,data){for(const fn of this.listeners[name]??[])fn({data:JSON.stringify(data)})}
  };
 });
 let reads=0;
 await page.route('**/api/account/receiving-identity',async route=>{reads++;await route.fulfill({status:503,contentType:'application/json',body:'{}'})});
 await page.goto('http://127.0.0.1:4173/?screen=navigation');
 await page.getByTestId('balance').waitFor();
 assert.equal(await page.getByTestId('balance').textContent(),'1480.000000');
 assert.equal(await page.getByTestId('uid').textContent(),'1234567897');
 assert.equal(await page.getByTestId('sync').textContent(),'syncing');
 assert.equal(await page.getByTestId('language').textContent(),'en');
 await page.getByRole('button',{name:'Language',exact:true}).click();
 for(const screen of ['wallet','activity','settings','home']){
  await page.getByRole('button',{name:screen,exact:true}).click();
  assert.equal(await page.getByTestId('balance').textContent(),'1480.000000');
  assert.equal(await page.getByTestId('uid').textContent(),'1234567897');
  assert.equal(await page.getByTestId('language').textContent(),'ar');
 }
 assert.equal(reads,0,'verified bootstrap identity must not be refetched on mount/navigation');
 const reloaded=page.waitForResponse(response=>response.url().includes('/api/account/receiving-identity'));await page.getByRole('button',{name:'Reload identity',exact:true}).click();await reloaded;await page.waitForFunction(()=>document.querySelector('[data-testid=uid]').textContent==='1234567897');
 assert.equal(reads,1,'explicit reload still works');
 assert.equal(await page.evaluate(()=>window.__streams.length),1,'one shared SSE');
 await page.evaluate(()=>window.__streams[0].emit('snapshot',{enabled:true,readable:true,userId:'11111111-2222-4333-8444-555555555555',balance:{posted:'1500.000000',held:'0'}}));
 await page.waitForFunction(()=>document.querySelector('[data-testid=balance]').textContent==='1500.000000');
 assert.equal(await page.getByTestId('sync').textContent(),'current');
 await page.screenshot({path:`.cache/visual-wallet/navigation-${width}.png`,fullPage:true});
 await page.evaluate(()=>window.__streams[0].emit('session-ended',{}));
 await page.waitForFunction(()=>document.querySelector('[data-testid=balance]').textContent==='EMPTY');
 assert.equal(await page.getByTestId('uid').textContent(),'EMPTY');
 assert.equal(await page.getByTestId('sync').textContent(),'unauthenticated');
 assert.deepEqual(errors,[]);
 await page.close();
 }
 console.log('Navigation lifecycle PASS: seeded display before SSE, background failure retention, no duplicate profile read/one stream across remounts, live update, persistent language, session-end clearing (360/1440). Synthetic fixture, not production Next navigation or load test.');
}finally{await browser.close()}
