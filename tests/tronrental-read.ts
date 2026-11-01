import assert from 'node:assert/strict';
import {tronRentalReadClient,tronRentalSun} from '../lib/tronrental-read';
async function main(){
const signal=new AbortController().signal;
let calls=0;
const transport:typeof fetch=async(input,init)=>{
 calls++;const u=new URL(String(input));assert.equal(u.origin,'https://api.tronrental.com');assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.equal(new Headers(init?.headers).get('X-API-Key'),'synthetic');assert.equal(init?.body,undefined);
 assert.ok(['/v1/account/balance','/v1/bandwidth/quote/me'].includes(u.pathname));
 return Response.json(u.pathname.endsWith('balance')?{balance_trx:'10.123456'}:{volume:1000,duration:'1h',personal_price:true,rental_trx:'0.4',fixed_fee_trx:'0.2',total_trx:'0.6'});
};
const c=tronRentalReadClient('synthetic',transport);
assert.equal(await c.balance(signal),10123456n);assert.equal((await c.bandwidthQuote(1000,signal)).costSun,600000n);assert.equal(calls,2);
for(const value of [1,null,'-1','1e3','0.0000001','NaN','01','1.'])assert.throws(()=>tronRentalSun(value));
assert.equal(tronRentalSun('0'),0n);
for(const volume of [0,100001,1.2,NaN])await assert.rejects(c.bandwidthQuote(volume,signal),/VOLUME/);
for(const patch of [{personal_price:'false'},{volume:999},{duration:'1d'},{total_trx:'0.7'},{fixed_fee_trx:'-1'}]){
 const bad=tronRentalReadClient('synthetic',async()=>Response.json({volume:1000,duration:'1h',personal_price:true,rental_trx:'0.4',fixed_fee_trx:'0.2',total_trx:'0.6',...patch}));
 await assert.rejects(bad.bandwidthQuote(1000,signal),/TRONRENTAL_/);
}
for(const status of [401,403,429,500])await assert.rejects(tronRentalReadClient('synthetic',async()=>new Response('synthetic',{status})).balance(signal),/TRONRENTAL_/);
await assert.rejects(tronRentalReadClient('synthetic',async()=>{throw Error('secret-synthetic')}).balance(signal),e=>e instanceof Error&&e.message==='TRONRENTAL_TRANSPORT');
await assert.rejects(tronRentalReadClient('synthetic',async()=>new Response('x'.repeat(65537),{headers:{'Content-Type':'application/json'}})).balance(signal),/LIMIT/);
assert.equal((await tronRentalReadClient('synthetic',async()=>Response.json({volume:1000,duration:'1h',personal_price:false,rental_trx:'0.4',fixed_fee_trx:'0.2',total_trx:'0.6'})).bandwidthQuote(1000,signal)).costSun,600000n);
console.log('TronRental read-only boundary PASS');

}
void main().catch(e=>{console.error(e);process.exitCode=1});
