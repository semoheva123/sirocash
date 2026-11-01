import assert from 'node:assert/strict';
import {checkCatFeeTraditionalReadiness,CATFEE_PRICE_BLOCKER,CATFEE_BANDWIDTH_BLOCKER} from '../lib/catfee-readiness';
import {catFeeOrderClient} from '../lib/catfee-orders';
async function main(){
 const env={CATFEE_API_KEY:'fixture-key',CATFEE_API_SECRET:'fixture-secret',SIRO_ENERGY_PURCHASE_ENABLED:'true',SIRO_CATFEE_ACCEPT_VARIABLE_PRICE:'true'};
 let calls=0,cost=1820000,balance=999999999,mode='normal';
 const fetcher:typeof fetch=async(url,init)=>{
  calls++;const u=new URL(String(url));assert.equal(init?.method,'GET');assert.equal(u.origin,'https://api.catfee.io');assert.equal(init?.redirect,'error');assert.equal(init?.body,undefined);
  if(mode==='error')return new Response(JSON.stringify({code:112,msg:env.CATFEE_API_SECRET}),{headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({code:0,data:u.pathname==='/v1/account'?{balance,email:'private@fixture.test',api_key:env.CATFEE_API_KEY,recharge_address:'private-recharge-address'}:cost}),{headers:{'content-type':'application/json'}});
 };
 const missing=await checkCatFeeTraditionalReadiness({env:{},verifyReads:true,fetch:fetcher});
 assert.equal(missing.readCheck,'MISSING_CREDENTIALS');assert.equal(calls,0);
 const offline=await checkCatFeeTraditionalReadiness({env,fetch:fetcher});
 assert.equal(offline.readCheck,'NOT_REQUESTED');assert.equal(calls,0);
 const direct=await checkCatFeeTraditionalReadiness({env:{...env,SIRO_CATFEE_DIRECT_RENTAL_ENABLED:'true'},fetch:fetcher});assert.equal(direct.directRentalEnabled,true);assert.equal(direct.priceLocked,false);assert(!direct.blockers.includes(CATFEE_PRICE_BLOCKER));assert(direct.blockers.includes('CATFEE_CURRENT_BANDWIDTH_REQUIRED'));assert.equal(direct.purchasesReady,false);assert.equal(calls,0);
 const good=await checkCatFeeTraditionalReadiness({env,verifyReads:true,fetch:fetcher});
 assert.equal(calls,2);assert.equal(good.readCheck,'VERIFIED');assert.equal(good.purchasesReady,false);assert.equal(good.estimatedEnergyWithinPerOrderCap,true);
 assert.equal(good.mode,'TRADITIONAL_RENTAL');assert.equal(good.funding,'MANUAL_TOP_UP');assert.equal(good.seamlessRequired,false);
 assert.equal(good.policy.nativeBurnFallback,false);assert.equal(good.policy.perOrderSun,'50000000');assert.equal(good.policy.dailySun,'200000000');
 for(const r of [missing,offline,good]){
  assert.equal(r.purchasesReady,false);assert(r.blockers.includes(CATFEE_PRICE_BLOCKER));assert(r.blockers.includes(CATFEE_BANDWIDTH_BLOCKER));
  const text=JSON.stringify(r);for(const secret of [env.CATFEE_API_KEY,env.CATFEE_API_SECRET,'private@fixture.test','private-recharge-address',String(balance)])assert(!text.includes(secret));
 }
 balance=0;const empty=await checkCatFeeTraditionalReadiness({env,verifyReads:true,fetch:fetcher});assert.equal(empty.purchasesReady,false);assert.equal(empty.readCheck,'VERIFIED');
 cost=50000001;const expensive=await checkCatFeeTraditionalReadiness({env,verifyReads:true,fetch:fetcher});assert.equal(expensive.estimatedEnergyWithinPerOrderCap,false);assert(expensive.blockers.includes('CATFEE_ESTIMATE_EXCEEDS_POLICY'));
 mode='error';const failed=await checkCatFeeTraditionalReadiness({env,verifyReads:true,fetch:fetcher});assert.equal(failed.readCheck,'FAILED');assert(!JSON.stringify(failed).includes(env.CATFEE_API_SECRET));
 const before=calls,signal=AbortSignal.abort();const aborted=await checkCatFeeTraditionalReadiness({env,verifyReads:true,fetch:fetcher,signal});assert.equal(aborted.readCheck,'FAILED');assert.equal(calls,before);
 const invalid=await checkCatFeeTraditionalReadiness({env:{...env,CATFEE_API_KEY:'bad\nkey'},verifyReads:true,fetch:fetcher});assert.equal(invalid.readCheck,'FAILED');assert.equal(calls,before);
 // Neither manual funding nor apparently valid read credentials may unlock paid paths.
 const client=catFeeOrderClient({credentials:{key:env.CATFEE_API_KEY,secret:env.CATFEE_API_SECRET},fetch:fetcher});
 assert.equal(client.purchaseBlocker?.(),CATFEE_PRICE_BLOCKER);
 await assert.rejects(()=>client.send({requestKey:'00000000-0000-0000-0000-000000000001',sender:'unused',energyAmount:65000,durationMinutes:60,maxCostSun:50000000n,signal:new AbortController().signal}),/HARD_PRICE_CAP/);
 await assert.rejects(()=>client.bandwidthPackage!(500,new AbortController().signal),/BANDWIDTH_EXECUTION/);assert.equal(calls,before);
 console.log('Traditional CatFee readiness PASS: manual top-up, offline/opt-in GETs, redacted reports, capped estimate not price lock, paid paths remain blocked. Fixtures only.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
