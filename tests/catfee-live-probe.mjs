import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const path=new URL('../scripts/probe-catfee-live.mjs',import.meta.url).href;
function run(mode,enabled=true){
 const code=`let calls=0;globalThis.fetch=async(url,init)=>{calls++;if(init.method!=='GET'||new URL(url).origin!=='https://api.catfee.io')throw Error('unexpected transport');if('${mode}'==='http')return new Response('private-fixture-secret',{status:403});if('${mode}'==='api')return Response.json({code:112,msg:'private-fixture-secret'});return Response.json({code:0,data:new URL(url).pathname==='/v1/account'?{balance:10,email:'private-fixture-email'}:new URL(url).pathname==='/v1/market'?{bandwidth_flash_price:1000000}:1820000})};await import(${JSON.stringify(path)});console.log('TEST_REQUESTS:'+calls)`;
 return spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,SIRO_CATFEE_LIVE_READ_PROBE_ONLY:enabled?(mode==='market'?'market':'true'):'false',CATFEE_API_KEY:'private-fixture-key',CATFEE_API_SECRET:'private-fixture-secret',SIRO_ENERGY_PURCHASE_ENABLED:mode==='guard'?'true':'false'}});
}
const skipped=run('ok',false);assert.equal(skipped.status,0);assert(skipped.stdout.includes('TEST_REQUESTS:0'));
for(const mode of ['ok','http','api','guard','market']){
 const r=run(mode);assert.equal(r.status,1);assert.equal(r.stderr,'');assert(r.stdout.includes('NO_SITE_PUBLICATION_INTENTIONAL_BUILD_STOP'));
 for(const secret of ['private-fixture-key','private-fixture-secret','private-fixture-email'])assert(!r.stdout.includes(secret));
 if(mode==='market'){assert(r.stdout.includes('BANDWIDTH_MARKET'));assert(r.stdout.includes('FLASH_PRICE_NOT_TRANSACTION_QUOTE'));assert(r.stdout.includes('TEST_REQUESTS:1'));assert(r.stdout.includes('\"status\":\"PASS\"'))}
 else if(mode==='ok'){assert(r.stdout.includes('"status":"PASS"'));assert(r.stdout.includes('TEST_REQUESTS:2'))}
 else {assert(r.stdout.includes('"status":"FAILED"'));assert(r.stdout.includes('TEST_REQUESTS:'+(mode==='guard'?0:1)))}
}
console.log('Live-probe safety PASS: opt-in GET-only, no credentials in output, stop on rejection, zero calls under action guard, deliberate publication stop even on success. Fixtures only.');
