import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('.cache/visual-wallet/screenshots',{recursive:true});
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'&&a!=='--disable-web-security'),headless:true});
const errors=[];
try{
 for(const width of [320,390,1440])for(const lang of ['ar','en']){
  const context=await browser.newContext({viewport:{width,height:844}});
  let ticket=null,messages=[],keys=new Map(),failFirst=true,postKeys=[];
  await context.route('**/api/support**',async route=>{
   const request=route.request(),url=new URL(request.url()),staff=url.searchParams.get('staff')==='1';
   if(request.method()==='POST'){
    const data=request.postDataJSON();
    if(data.action==='close'){ticket.status='CLOSED';return route.fulfill({json:{id:ticket.id}})}
    postKeys.push(data.requestKey);
    if(!keys.has(data.requestKey)){
     if(data.action==='create')ticket={id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',subject:data.subject,category:data.category,status:'WAITING_SUPPORT',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
     messages.push({id:crypto.randomUUID(),body:data.body,fromSupport:staff,createdAt:new Date().toISOString()});
     ticket.status=staff?'WAITING_CUSTOMER':'WAITING_SUPPORT';keys.set(data.requestKey,ticket.id);
    }
    if(failFirst){failFirst=false;return route.abort('failed')}
    return route.fulfill({json:{id:ticket.id}});
   }
   return route.fulfill({json:url.pathname==='/api/support'?{tickets:ticket?[ticket]:[],next:null}:{ticket,messages,next:null}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:4173/?screen=support&lang=${lang}`);
  await page.getByRole('button',{name:lang==='ar'?'طلب دعم جديد':'New request',exact:true}).click();
  await page.locator('#support-subject').fill(lang==='ar'?'استفسار عن الإيداع':'A question about my deposit');
  const text='Test message <script>window.injected=true</script> '+('a'.repeat(140));
  await page.locator('#support-body').fill(lang==='ar'?'مرحباً فريق سيرو كاش، أحتاج إلى المساعدة في مراجعة حالة إيداعي الأخير. لدي مرجع العملية ويمكنني مشاركته هنا. شكراً لكم.':'Hello Siro Cash team, I would like help reviewing the status of my latest deposit. I have the transaction reference available. Thank you.');
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width!==320)await page.screenshot({path:`.cache/visual-wallet/screenshots/support-compose-${lang}-${width}.png`,fullPage:true});
  await page.locator('#support-body').fill(text);
  await page.locator('.support-submit').click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('#support-body').inputValue(),text);
  assert(await page.locator('#support-body').isDisabled());
  await page.locator('.support-submit').click();
  await page.locator('.support-message').waitFor();
  assert.equal(postKeys[0],postKeys[1]);assert.equal(messages.length,1);
  assert.equal(await page.locator('.support-message p').textContent(),text);
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  await page.locator('#support-reply').fill('Customer follow-up.');await page.locator('.support-submit').click();
  await page.waitForFunction(()=>document.querySelectorAll('.support-message').length===2);
  await page.goto(`http://127.0.0.1:4173/?screen=staff-support&lang=${lang}`);
  await page.locator('.support-ticket').first().click();
  await page.locator('#support-reply').fill('Official team response.');await page.locator('.support-submit').click();
  await page.locator('.from-team').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width===390)await page.screenshot({path:`.cache/visual-wallet/screenshots/support-thread-${lang}.png`,fullPage:true});
  page.on('dialog',dialog=>dialog.accept());await page.locator('.support-close').click();
  await page.waitForFunction(()=>!document.querySelector('#support-reply'));
  await page.goto(`http://127.0.0.1:4173/?screen=support&lang=${lang}`);await page.locator('.support-ticket').first().click();
  await page.locator('.support-message').first().waitFor();assert.equal(await page.locator('#support-reply').count(),0);
  assert.equal(messages.length,3);await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log('Support browser PASS: six AR/EN/mobile/desktop flows, create, persisted-but-lost response idempotent retry, preserved draft, customer/staff replies, closure, escaped hostile content, no horizontal overflow or runtime errors. Synthetic only.');
}finally{await browser.close()}
