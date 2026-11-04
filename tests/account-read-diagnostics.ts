import assert from 'node:assert/strict';
import {measureAccountRead} from '../lib/account-read-diagnostics';
async function main(){
 const logs:unknown[]=[];let ms=0;
 assert.equal(await measureAccountRead('session',async()=>42,()=>ms,(...v)=>logs.push(v)),42);assert.equal(logs.length,0);
 await measureAccountRead('identity-bootstrap',async()=>{ms+=1500},()=>ms,(...v)=>logs.push(v));assert.equal(logs.length,1);
 const error={code:'42501',message:'secret://private.sql/token',owner:'private'};
 await assert.rejects(measureAccountRead('financial-bootstrap',async()=>{throw error},()=>ms,(...v)=>logs.push(v)),e=>e===error);
 assert.equal(logs.length,2);assert(!JSON.stringify(logs).includes('secret'));assert(JSON.stringify(logs).includes('PERMISSIONS'));
 await assert.rejects(measureAccountRead('financial-bootstrap',async()=>{throw error},()=>ms,(...v)=>logs.push(v)));assert.equal(logs.length,2,'diagnostics throttle repeated failures');
 console.log('Account read diagnostics PASS: fast reads quiet, slow/error phases measured, original rejection retained, secrets absent and per-phase throttling.');
}
void main();
