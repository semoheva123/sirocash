import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {watchPublicExchangeSchedule} from '../lib/exchange-source-schedule';
async function main(){
 let tick=()=>{},calls=0,stopped=0,reject=false;
 const stop=watchPublicExchangeSchedule(async()=>{calls++;if(reject)throw Error('fixture')},(fn,ms)=>{
  assert.equal(ms,30000);tick=fn;return()=>{stopped++};
 });
 assert.equal(calls,0);
 tick();await Promise.resolve();assert.equal(calls,1);
 reject=true;tick();await Promise.resolve();assert.equal(calls,2);
 stop();tick();assert.equal(calls,2);assert.equal(stopped,1);
 const wake=readFileSync(new URL('../lib/exchange-public-wake.ts',import.meta.url),'utf8');
 assert.match(wake,/nextLocalCheck=now\+30000/);
 for(const gate of ['"publicEnabled"','"publicBlockedUntil"<=now()','"publicNextAttemptAt"<=now()','"publicNextWakeAt"<=now()',"interval '5 minutes'"])assert.ok(wake.includes(gate));
 const route=readFileSync(new URL('../app/api/exchange-rates/events/route.ts',import.meta.url),'utf8');
 assert.ok(route.indexOf('watchPublicExchangeSchedule(wakePublicExchange)')>route.indexOf("hub.subscribe('exchange-feed'"));
 assert.ok(route.includes('stop();off();feedOff()'));
 console.log('Public source schedule PASS: 30s server due-check, shared 5min claim/pause gates, safe failures, teardown, no client/balance polling or live source I/O.');
}
void main();
