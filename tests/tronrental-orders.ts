import assert from 'node:assert/strict';
import {tronBandwidth} from '../lib/tron-bandwidth';
import {tronRentalOrderClient} from '../lib/tronrental-orders';
import {treasuryDestination} from '../lib/treasury-addresses';
async function main(){
 assert.deepEqual(tronBandwidth({NetLimit:200,freeNetLimit:300}),{delegated:200,free:300,available:300});
 assert.equal(tronBandwidth({NetLimit:200,NetUsed:100,freeNetLimit:600,freeNetUsed:500}).available,100);
 let posts=0,active=0,mode='ok';const sender=treasuryDestination('TRC20','operating');
 const order={sender,requestKey:'00000000-0000-0000-0000-000000000001',quantity:500,maxCostSun:600000n,expiresAt:Date.now()+25000,signal:new AbortController().signal};
 const mock:typeof fetch=async(input,init)=>{
  const u=new URL(String(input));assert.equal(u.origin,'https://api.tronrental.com');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('X-API-Key'),'fixture-key');
  if(init?.method==='POST'){posts++;assert.equal(u.pathname,'/v1/bandwidth/buy');assert.equal(new Headers(init.headers).get('Idempotency-Key'),order.requestKey);assert.deepEqual(JSON.parse(String(init.body)),{target_address:sender,volume:500,duration:'1h',max_price_trx:'0.600000'});if(mode==='timeout')throw Error('fixture-key');return Response.json({id:7,status:'pending',price_trx:'0.6',activation_cost_trx:'0',txid:null})}
  assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);assert.equal(u.pathname,'/v1/orders/7');return Response.json({id:7,type:'bandwidth',target_address:mode==='wrong'?'other':sender,volume:500,duration:'1h',price_trx:'0.6',activation_cost_trx:null,status:'filled',delegate_txid:'ab'.repeat(32)});
 };
 const client=(enabled=true)=>tronRentalOrderClient({key:'fixture-key',enabled,fetch:mock,assertActive:async()=>{active++;if(mode==='inactive')throw Error('TRON_ACTIVE_ACCOUNT_UNPROVEN')}});
 await assert.rejects(client(false).send(order),/DISABLED/);assert.equal(active,0);assert.equal(posts,0);
 mode='inactive';await assert.rejects(client().send(order),/UNPROVEN/);assert.equal(posts,0);
 mode='ok';await assert.rejects(client().send({...order,expiresAt:Date.now()-1}),/EXPIRED/);assert.equal(posts,0);
 assert.equal((await client().send(order)).actualCostSun,600000n);assert.equal(posts,1);
 const receipt=await client().check(order,'7');assert.equal(receipt.status,'success');assert.equal(receipt.actualCostSun,600000n);assert.equal(receipt.delegationTxId,'ab'.repeat(32));
 mode='wrong';await assert.rejects(client().check(order,'7'),/BINDING/);
 mode='timeout';await assert.rejects(client().send(order),e=>e instanceof Error&&e.message==='TRONRENTAL_ORDER_UNVERIFIED');assert.equal(posts,2,'no internal retries');
 console.log('TronRental paid-boundary fixtures PASS: disabled gate, active-account requirement, expired quote refusal, exact capped/idempotent POST, bounded lookup binding, null activation cost and redacted no-retry timeout');
}
void main().catch(e=>{console.error(e);process.exitCode=1});
