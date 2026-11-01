import assert from 'node:assert/strict';
import {catFeeOrderClient} from '../lib/catfee-orders';
import {createFinancialExecution} from '../lib/financial-execution';
import type {WalletDb} from '../lib/wallet-engine';
import {treasuryDestination} from '../lib/treasury-addresses';
async function main(){
 const o={requestKey:'00000000-0000-0000-0000-000000000001',sender:treasuryDestination('TRC20','operating'),energyAmount:65000,durationMinutes:60 as const,maxCostSun:4000000n,signal:new AbortController().signal};
 let calls=0,status='PAYMENT_SUCCESS',confirmation='UNCONFIRMED',wrong=false,cost=1820000;
 const client=catFeeOrderClient({credentials:{key:'fixture-key',secret:'fixture-secret'},fetch:async(url,init)=>{
  calls++;assert.equal(init?.method,'GET');const u=new URL(String(url));
  if(u.pathname==='/v1/estimate')return new Response(JSON.stringify({code:0,data:1820000}),{headers:{'content-type':'application/json'}});
  assert.equal(u.pathname,'/v1/order');assert.equal(u.searchParams.get('client_order_id'),o.requestKey);
  return new Response(JSON.stringify({code:0,data:{id:'catfee-fixture',client_order_id:wrong?'wrong':o.requestKey,receiver:o.sender,resource_type:'ENERGY',quantity:65000,duration:1,pay_amount_sun:cost,activate_amount_sun:0,status,confirm_status:confirmation,delegate_hash:'ab'.repeat(32)}}),{headers:{'content-type':'application/json'}});
 }});
 assert.equal(client.purchaseBlocker?.(),'CATFEE_HARD_PRICE_CAP_UNVERIFIED');
 await assert.rejects(()=>client.send(o),/HARD_PRICE_CAP/);assert.equal(calls,0);
 await assert.rejects(()=>client.bandwidthPackage!(500,o.signal),/BANDWIDTH_EXECUTION/);assert.equal(calls,0);
 assert.equal((await client.quote(o)).costSun,1820000n);
 await assert.rejects(()=>client.quote({...o,bandwidthAmount:1000}),/BANDWIDTH_QUOTE/);
 assert.equal((await client.check(o)).status,'pending');status='DELEGATE_SUCCESS';assert.equal((await client.check(o)).status,'pending');
 confirmation='DELEGATION_CONFIRMED';assert.equal((await client.check(o)).status,'success');
 cost=5000000;assert.equal((await client.check(o)).priceExceeded,true);
 wrong=true;await assert.rejects(()=>client.check(o),/BINDING/);wrong=false;
 status='UNKNOWN';assert.equal((await client.check(o)).status,'failed');
 const before=calls;let reads=0;
 const db:WalletDb={transaction:async run=>run({query:async sql=>{assert(sql.startsWith('SELECT * FROM "EnergyRentalIntent"'));reads++;return {rows:[{state:'PREPARED'}]}}})};
 const execution=createFinancialExecution(db,{purchaseEnabled:true,client,delivery:async()=>{throw Error('must not observe')},resources:async()=>{throw Error('must not authorize')}});
 assert.deepEqual(await execution.energy(o.requestKey,o.signal),{state:'HELD',reason:'CATFEE_HARD_PRICE_CAP_UNVERIFIED'});assert.equal(reads,1);assert.equal(calls,before);
 console.log('CatFee recovery: exact client-ID/sender/quantity, confirmed vs submitted, cost breach and fail-closed paid/bandwidth paths passed. No paid requests.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
