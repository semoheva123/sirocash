/** Actual wallet presentation + isolated CDN fixtures. No production login or POST. */
import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('.cache/static-performance',{recursive:true});
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'&&a!=='--disable-web-security'),headless:true});
const results=[];
try{
 for(const width of [320,390,1440])for(const lang of ['ar','en'])for(const failure of [false,true]){
  const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),errors=[];let reads=0;
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{assert.equal(r.method(),'GET');assert(!r.url().includes('/api/exchange-rates'));});
  await page.route('https://semoheva123.github.io/sirocash/rates.json',async route=>{
   reads++;assert(!route.request().headers()['cookie']);
   if(failure)return route.abort();
   return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify({source:'sp-today',city:'syria-general',unit:'SYP_NEW',observation:'public-page',market:{buy:144,sell:144.5},fx:[{pair:'USD/TRY',rate:50},{pair:'EUR/USD',rate:1.12}],fetchedAt:new Date().toISOString()})});
  });
  await page.addInitScript(()=>{window.longTasks=[];try{new PerformanceObserver(list=>{window.longTasks.push(...list.getEntries().map(e=>e.duration))}).observe({type:'longtask',buffered:true})}catch{}});
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto(`http://127.0.0.1:4173/?screen=home&lang=${lang}`);
  const show=page.getByRole('button',{name:lang==='ar'?'إظهار الرصيد':'Show balance',exact:true});await show.waitFor();
  const start=performance.now();await show.click();await page.getByRole('button',{name:lang==='ar'?'إخفاء الرصيد':'Hide balance',exact:true}).waitFor();const interactionMs=Math.round(performance.now()-start);
  await page.locator('.exchange-ticker-empty, .exchange-ticker-group strong').first().waitFor();
  assert.equal(reads,1);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const track=page.locator('.exchange-ticker-track').first();const animation=await track.count()?await track.evaluate(el=>getComputedStyle(el).animationName):'none';assert.equal(animation,'none');
  if(!failure&&width===390)await page.screenshot({path:`.cache/static-performance/wallet-${lang}.png`,fullPage:true});
  results.push({width,lang,sourceFailure:failure,interactionMs,longTasks:await page.evaluate(()=>window.longTasks)});await context.close();
 }
 await writeFile('.cache/static-performance/results.json',JSON.stringify(results,null,2));
 console.log('Static feed browser PASS: 12 AR/EN 320/390/1440 wallet renders, 4x CPU, working balance visibility with CDN success/failure, one independent source read, no wallet exchange request/cookies/POST/continuous animation/overflow. Synthetic only.');
 console.log(JSON.stringify(results.map(({longTasks,...r})=>({...r,longTaskCount:longTasks.length,maxLongTaskMs:Math.round(Math.max(0,...longTasks))}))));
}finally{await browser.close()}
