import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
function run(mode,flag='true',guard='false'){
 const harness=`let calls=0;globalThis.fetch=async(input,init)=>{calls++;const u=new URL(String(input));if(u.origin!=='https://api.tronrental.com'||init.method!=='GET'||init.redirect!=='error'||init.body!==undefined||new Headers(init.headers).get('X-API-Key')!=='synthetic-probe-secret')throw Error('secret failure');if(${JSON.stringify(mode)}==='transport')throw Error('synthetic-probe-secret');if(u.pathname==='/v1/account/balance')return ${JSON.stringify(mode)}==='denied'?new Response('synthetic-probe-secret',{status:401}):Response.json({balance_trx:'0'});if(u.pathname!=='/v1/bandwidth/quote/me'||u.search!=='?volume=1000&duration=1h')throw Error('unexpected route');return Response.json({volume:1000,duration:'1h',personal_price:false,rental_trx:'0.4',fixed_fee_trx:'0.2',total_trx:${JSON.stringify(mode)}==='bad'?'0.9':'0.6'});};process.on('exit',()=>console.log('CALLS:'+calls));require('./scripts/probe-tronrental-live.ts');`;
 const p=spawnSync(process.execPath,['--conditions=react-server','--import','tsx','--eval',harness],{cwd:process.cwd(),encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,TRONRENTAL_API_KEY:'synthetic-probe-secret',SIRO_TRONRENTAL_LIVE_READ_PROBE_ONLY:flag,SIRO_SIGNER_ENABLED:guard}});
 assert.equal(p.error,undefined);const text=p.stdout+p.stderr;assert.ok(!text.includes('synthetic-probe-secret'));return {status:p.status,text};
}
let r=run('ok','');assert.equal(r.status,0);assert.match(r.text,/CALLS:0/);
r=run('ok','true','true');assert.equal(r.status,1);assert.match(r.text,/LIVE_ACTION_GUARD/);assert.match(r.text,/CALLS:0/);
r=run('ok');assert.equal(r.status,1);assert.match(r.text,/"status":"PASS"/);assert.match(r.text,/"costSun":"600000"/);assert.match(r.text,/CALLS:2/);
for(const mode of ['denied','transport','bad']){r=run(mode);assert.equal(r.status,1);assert.match(r.text,/"status":"FAILED"/);assert.match(r.text,/"purchases":0,"broadcasts":0/);assert.match(r.text,/NO_SITE_PUBLICATION/);assert.match(r.text,new RegExp('CALLS:'+(mode==='bad'?2:1)));}
console.log('TronRental live-probe safety PASS: no-op, guard, auth, account quote, redaction, first-failure stop and no publication');
