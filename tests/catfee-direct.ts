import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {catFeeOrderClient} from '../lib/catfee-orders';
import {treasuryDestination} from '../lib/treasury-addresses';
async function main(){
 const credentials={key:'fixture-key',secret:'fixture-secret'};
 const order={requestKey:'00000000-0000-0000-0000-000000000001',sender:treasuryDestination('TRC20','operating'),energyAmount:65000,durationMinutes:60 as const,maxCostSun:3000000n,signal:new AbortController().signal};
 let calls=0,mode='ok',confirmed=false,price=1820000;const seen:string[]=[];
 const mock:typeof fetch=async(url,init)=>{
  calls++;const u=new URL(String(url)),h=new Headers(init?.headers),method=init?.method!;seen.push(method);
  assert.equal(u.origin,'https://api.catfee.io');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.equal(init?.body,undefined);
  assert.equal(h.get('CF-ACCESS-SIGN'),createHmac('sha256',credentials.secret).update(h.get('CF-ACCESS-TIMESTAMP')!+method+u.pathname+u.search).digest('base64'));
  if(method==='GET'&&u.pathname==='/v1/estimate')return Response.json({code:0,data:price});
  assert.equal(u.pathname,'/v1/order');assert.equal(u.searchParams.get('client_order_id'),order.requestKey);
  if(method==='POST'){
   assert.equal(u.searchParams.get('quantity'),'65000');assert.equal(u.searchParams.get('receiver'),order.sender);assert.equal(u.searchParams.get('duration'),'1h');assert.equal(u.searchParams.get('activate'),'false');
   assert.equal(u.searchParams.get('max_price'),null);assert.equal(u.searchParams.get('max_cost_sun'),null);
   if(mode==='timeout')throw Error('fixture-secret');
   if(mode==='reject')return Response.json({code:111,msg:'fixture-secret'});
  }else assert.equal(method,'GET');
  return Response.json({code:0,data:{id:'direct-fixture',client_order_id:mode==='wrong'?'wrong':order.requestKey,receiver:order.sender,resource_type:'ENERGY',quantity:65000,duration:1,pay_amount_sun:price,activate_amount_sun:0,status:'DELEGATE_SUCCESS',confirm_status:confirmed?'DELEGATION_CONFIRMED':'UNCONFIRMED',delegate_hash:'ab'.repeat(32)}});
 };
 const client=catFeeOrderClient({credentials,fetch:mock,directRentalEnabled:true});
 assert.equal(client.purchaseBlocker?.(),undefined);
 assert.equal((await client.quote(order)).costSun,1820000n);
 assert.deepEqual(await client.send(order),{orderId:'direct-fixture'});assert.deepEqual(seen,['GET','POST']);
 assert.equal((await client.check(order)).status,'pending');confirmed=true;assert.equal((await client.check(order)).status,'success');
 price=4000000;assert.equal((await client.check(order)).priceExceeded,true);await assert.rejects(()=>client.quote(order),/QUOTE_CAP/);price=1820000;
 let before=calls;
 await assert.rejects(()=>client.send({...order,bandwidthAmount:500}),/BANDWIDTH_EXECUTION/);
 await assert.rejects(()=>client.send({...order,requestKey:'-'.repeat(36)}),/ORDER_INPUT/);
 await assert.rejects(()=>client.send({...order,energyAmount:64000}),/ORDER_INPUT/);
 await assert.rejects(()=>client.send({...order,signal:AbortSignal.abort()}),/ORDER_INPUT/);assert.equal(calls,before);
 for(const failure of ['timeout','reject']){
  mode=failure;before=calls;await assert.rejects(()=>client.send(order),e=>e instanceof Error&&e.message==='CATFEE_CREATE_UNVERIFIED');assert.equal(calls,before+1,'Never automatically retry a possibly charged order');
 }
 mode='wrong';await assert.rejects(()=>client.send(order),/BINDING/);
 const disabled=catFeeOrderClient({credentials,fetch:mock});before=calls;await assert.rejects(()=>disabled.send(order),/HARD_PRICE_CAP/);assert.equal(calls,before);
 console.log('CatFee direct PASS: opt-in POST, exact signature/query, no activation or signed customer tx, ACK not delivery, original-ID recovery, price breach, unknown no retry and disabled gates. Mock requests only.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
