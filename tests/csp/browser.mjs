/** Browser-enforced actual production CSP. No production sessions/source/financial I/O. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
const server=spawn(process.execPath,['--import','tsx','tests/csp/server.ts'],{env:{...process.env,VERCEL_ENV:'production',NODE_ENV:'production'},stdio:['ignore','pipe','inherit']});
let browser;
try{
 const port=await new Promise((resolve,reject)=>{
  let text='';const deadline=setTimeout(()=>reject(Error('CSP_SERVER_TIMEOUT')),20000);
  server.once('exit',code=>{clearTimeout(deadline);reject(Error(`CSP_SERVER_EXIT:${code}`))});
  server.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/CSP_TEST_PORT=(\d+)/);if(match){clearTimeout(deadline);resolve(match[1])}});
 });
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']}: {})});
 for(const path of ['/before','/after']){
  const page=await browser.newPage(),errors=[];let allowedReads=0;
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route('https://semoheva123.github.io/**',async route=>{
   assert.equal(route.request().url(),'https://semoheva123.github.io/sirocash/rates.json','CSP must block sibling paths before network');
   assert.equal(route.request().method(),'GET');assert(!route.request().headers().cookie);assert(!route.request().headers().referer);allowedReads++;
   await route.fulfill({status:200,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},body:JSON.stringify({source:'sp-today',city:'syria-general',unit:'SYP_NEW',observation:'public-page',market:{buy:144,sell:144.5},fx:[],fetchedAt:new Date().toISOString()})});
  });
  const response=await page.goto(`http://127.0.0.1:${port}${path}`);
  assert(response.headers()['content-security-policy'].includes("frame-ancestors 'none'"));
  await page.waitForFunction(()=>document.getElementById('status').textContent!=='loading');
  assert.equal(await page.locator('#status').textContent(),path==='/before'?'unavailable':'ready:144');
  assert.equal(allowedReads,path==='/before'?0:1,'negative control reproduces the reported failure');
  await page.locator('#control').click();assert.equal(await page.locator('#result').textContent(),'responsive');
  assert.equal(await page.evaluate(()=>fetch('/health').then(r=>r.json()).then(r=>r.ok)),true);
  for(const url of ['https://semoheva123.github.io/sirocash/other.json','https://semoheva123.github.io/other-project/rates.json','https://example.com/leak']){
   assert.equal(await page.evaluate(url=>fetch(url).then(()=>false,()=>true),url),true);
  }
  assert.equal(allowedReads,path==='/before'?0:1);assert.deepEqual(errors,[]);await page.close();
 }
 for(const width of [390,1280])for(const language of ['ltr','rtl']){
  const page=await browser.newPage({viewport:{width,height:800},reducedMotion:'no-preference'});
  await page.goto(`http://127.0.0.1:${port}/motion-${language}`);
  const track=page.locator('.exchange-ticker-track');
  assert.equal(await track.evaluate(e=>getComputedStyle(e).animationName),'exchange-news');
  const transform=await track.evaluate(e=>getComputedStyle(e).transform);
  await page.waitForFunction(previous=>getComputedStyle(document.querySelector('.exchange-ticker-track')).transform!==previous,transform);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.locator('.exchange-ticker-group[aria-hidden="true"]').count(),1);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await track.evaluate(e=>getComputedStyle(e).animationName),'none');
  assert.equal(await page.locator('.exchange-ticker-window').evaluate(e=>getComputedStyle(e).overflowX),'auto');
  assert.equal(await page.locator('.exchange-ticker-group[aria-hidden="true"]').isVisible(),false);
  await page.close();
 }
 console.log('Ticker browser PASS: actual component/CSS animates at phone/desktop sizes in RTL/LTR, no page overflow, reduced motion disables animation and keeps prices scrollable. Synthetic only.');
 console.log('Production CSP browser PASS: old policy reproduces blocked prices; real fixed proxy policy + actual reader loads only the exact public JSON without cookies/referrer. Sibling paths/external hosts blocked; nonce scripts, self fetch and local interaction preserved. Synthetic response, no production auth or financial I/O.');
}finally{
 await browser?.close();if(server.exitCode===null&&server.signalCode===null){const exit=once(server,'exit');server.kill('SIGTERM');await exit;}
}
