import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {tronZapOrderClient} from '../lib/tronzap-orders';
import {treasuryDestination} from '../lib/treasury-addresses';
async function main(){
 const credentials={token:'fixture-not-a-token',secret:'fixture-not-a-secret'},calls:string[]=[];
 const order={requestKey:'00000000-0000-0000-0000-000000000001',sender:treasuryDestination('TRC20','operating'),energyAmount:65000,durationMinutes:60 as const,maxCostSun:4000000n,signal:new AbortController().signal};
 let overPrice=false,wrongBinding=false,fail=false;
 const request=(async(url,init)=>{
  const path=new URL(String(url)).pathname,body=String(init?.body),p=JSON.parse(body),headers=new Headers(init?.headers);calls.push(path);
  assert.equal(headers.get('Authorization'),'Bearer '+credentials.token);assert.equal(headers.get('X-Signature'),createHash('sha256').update(body+credentials.secret).digest('hex'));
  if(fail)return new Response(JSON.stringify({code:20}),{headers:{'content-type':'application/json'}});
  const result=path.endsWith('calculate')?{address:order.sender,type:'energy',amount:65000,duration:1,price:overPrice?'5':'2.45',activation_fee:'1.4',total:overPrice?'6.4':'3.85'}:{id:'provider-fixture',external_id:wrongBinding?'wrong':order.requestKey,service:'energy',params:{address:order.sender,duration:1,amounts:{energy:65000}},status:'success',amount:overPrice?'5':'3.85',hash:'ab'.repeat(32)};
  if(path.endsWith('/new'))assert.deepEqual(p,{service:'energy',params:{address:order.sender,amounts:{energy:65000},duration:1},external_id:order.requestKey});
  if(path.endsWith('/check'))assert.deepEqual(p,{external_id:order.requestKey});
  return new Response(JSON.stringify({code:0,result}),{headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 const readonly=tronZapOrderClient({credentials,fetch:request});
 await assert.rejects(()=>readonly.send(order),/NOT_AUTHORIZED/);assert.equal(calls.length,0);
 assert.equal((await readonly.check(order)).actualCostSun,3850000n);assert.ok(calls.every(p=>p.endsWith('/check')));
 const noRiskAcceptance=tronZapOrderClient({credentials,fetch:request,purchaseEnabled:true});
 await assert.rejects(()=>noRiskAcceptance.send(order),/NOT_AUTHORIZED/);
 const client=tronZapOrderClient({credentials,fetch:request,purchaseEnabled:true,acceptVariableProviderPrice:true});
 assert.deepEqual(await client.send(order),{orderId:'provider-fixture'});assert.equal(calls.filter(p=>p.endsWith('/new')).length,1);
 overPrice=true;await assert.rejects(()=>client.send(order),/UNCERTAIN/);assert.equal(calls.filter(p=>p.endsWith('/new')).length,1);
 assert.equal((await readonly.check(order)).priceExceeded,true);overPrice=false;
 wrongBinding=true;await assert.rejects(()=>client.check(order),/UNVERIFIED/);wrongBinding=false;
 fail=true;await assert.rejects(()=>client.check(order),/UNVERIFIED/);assert.equal(calls.filter(p=>p.endsWith('/new')).length,1);
 fail=false;const stop=new AbortController();stop.abort();const n=calls.length;await assert.rejects(()=>client.send({...order,signal:stop.signal}),/INPUT/);assert.equal(calls.length,n);
 console.log('TronZap orders: exact SHA256 bytes/official endpoints, explicit variable-price gate, reprice-before-create, bound external-id recovery, actual cost/breach reporting and no retry passed. Fixtures only; no paid requests.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
