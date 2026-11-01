import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const path=new URL('../scripts/probe-catfee-live.mjs',import.meta.url).href;
for(const mode of ['ok','denied','schema']){
 const code=`import {createHmac} from 'node:crypto';let calls=0;globalThis.fetch=async(url,init)=>{calls++;const u=new URL(url),h=new Headers(init.headers),q=Number(u.searchParams.get('quantity'));if(init.method!=='POST'||u.origin!=='https://api.catfee.io'||u.pathname!=='/v1/mate/open/transaction/estimate'||init.body!==undefined||init.redirect!=='error')throw Error('bad request');if(h.get('Content-Type')!=='application/json')throw Error('missing content type');if(h.get('CF-ACCESS-SIGN')!==createHmac('sha256','fixture-secret').update(h.get('CF-ACCESS-TIMESTAMP')+'POST'+u.pathname+u.search).digest('base64'))throw Error('bad signature');if(u.searchParams.get('resource_type')!==(calls===1?'ENERGY':'BANDWIDTH'))throw Error('wrong resource');return Response.json('${mode}'==='denied'?{code:403,msg:'fixture-secret'}:{code:0,data:{quantity:'${mode}'==='schema'?1:q,amount_sun:123456,payee_address:'private-payee'}})};await import(${JSON.stringify(path)});console.log('TEST_REQUESTS:'+calls)`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,SIRO_CATFEE_LIVE_READ_PROBE_ONLY:'handoff',CATFEE_API_KEY:'fixture-key',CATFEE_API_SECRET:'fixture-secret'}});
 assert.equal(r.status,1);assert.equal(r.stderr,'');assert(r.stdout.includes('NO_SITE_PUBLICATION_INTENTIONAL_BUILD_STOP'));
 assert(!r.stdout.includes('fixture-secret'));assert(!r.stdout.includes('fixture-key'));assert(!r.stdout.includes('private-payee'));
 if(mode==='ok'){assert(r.stdout.includes('TEST_REQUESTS:2'));assert(r.stdout.includes('HANDOFF_ENERGY'));assert(r.stdout.includes('HANDOFF_BANDWIDTH'));assert(r.stdout.includes('"status":"PASS"'))}
 else {assert(r.stdout.includes('TEST_REQUESTS:1'));assert(r.stdout.includes('"status":"FAILED"'))}
}
console.log('Handoff probe PASS: exact signed POST estimates only, both resource types, bound quantities, no secret/payee output, stop on denial/schema failure, no order creation/publication. Fixtures only.');
