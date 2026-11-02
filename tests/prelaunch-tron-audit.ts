import assert from 'node:assert/strict';
import {tronUsdtContract} from '../lib/tron-deposit-verification';
import {base58} from '@scure/base';
import {auditUnusedTronAddress} from '../lib/prelaunch-tron-audit';
const address='THici1qxA1dQZK52fJ18RHX8j1Ef1ktyDD';
const history=()=>({success:true,data:[],meta:{page_size:0,at:Date.now()}});
async function main(){
 assert.equal(tronUsdtContract,'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t','Mainnet USDT must not use a testnet contract');
 const mock=(h:unknown=history(),account:unknown={},balance:unknown={result:{result:true},constant_result:['0'.repeat(64)]})=>(async(url:unknown,init:RequestInit)=>{
  assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal((init.headers as Record<string,string>)['TRON-PRO-API-KEY'],'fixture-key');
  const path=new URL(String(url)).pathname;
  if(path.endsWith('/triggerconstantcontract')){
   const body=JSON.parse(String(init.body));
   assert.equal(body.contract_address,Buffer.from(base58.decode('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).subarray(0,21).toString('hex'));
   assert.equal(body.parameter,Buffer.from(base58.decode(address)).subarray(1,21).toString('hex').padStart(64,'0'));
  }
  return new Response(JSON.stringify(path.endsWith('/trc20')?h:path.endsWith('/getaccount')?account:balance),{headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 const options={apiKey:'fixture-key',signal:AbortSignal.timeout(10000)};
 assert.equal((await auditUnusedTronAddress(address,{...options,fetch:mock()})).usdtBalanceZero,true);
 for(const h of [{...history(),data:[{value:'1'}]},{...history(),success:false},{...history(),meta:{page_size:0,at:Date.now(),links:{next:'private'}}},{...history(),meta:{page_size:0,at:0}},{data:[]},null])await assert.rejects(()=>auditUnusedTronAddress(address,{...options,fetch:mock(h)}));
 for(const account of [{balance:1},{address:'activated'},[],null])await assert.rejects(()=>auditUnusedTronAddress(address,{...options,fetch:mock(history(),account)}));
 for(const balance of [{result:{result:true},constant_result:['1'.padStart(64,'0')]},{result:{result:false},constant_result:['0'.repeat(64)]},{}])await assert.rejects(()=>auditUnusedTronAddress(address,{...options,fetch:mock(history(),{},balance)}));
 await assert.rejects(()=>auditUnusedTronAddress('invalid',{...options,fetch:mock()}));
 console.log('Prelaunch audit PASS: refuse activity, incomplete/stale history, activated accounts, nonzero balances and malformed evidence. Fixture reads only; no resets or funds.');
}
void main().catch(e=>{console.error(e);process.exitCode=1});
