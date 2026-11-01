import assert from 'node:assert/strict';
import {createBep20ReadRpc} from '../lib/bep20-rpc';
import {observeBep20UsdtReceipt,type Bep20Rpc} from '../lib/bep20-receipt-observer';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
const txId='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32),other='0x'+'ef'.repeat(32);
const log={address:bep20UsdtContract,transactionHash:txId,blockHash,blockNumber:'0x64',transactionIndex:'0x0',removed:false,logIndex:'0x7',topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'0'.repeat(63)+'1','0x'+'0'.repeat(63)+'2'],data:'0x'+(20n*10n**18n).toString(16).padStart(64,'0')};
const receipt={transactionHash:txId,blockHash,blockNumber:'0x64',transactionIndex:'0x0',status:'0x1',logs:[log]};
const block={hash:blockHash,number:'0x64',transactions:[txId]};
function transport(change:(method:string,params:unknown[],value:unknown,call:number)=>unknown=(_m,_p,v)=>v):Bep20Rpc{
 let calls=0;return async(method,params)=>{
  calls++;
  const value=method==='eth_chainId'?'0x38':method==='eth_blockNumber'?'0x78':method==='eth_getTransactionReceipt'?receipt:params[0]==='finalized'?{number:'0x73',hash:other}:block;
  return change(method,params,structuredClone(value),calls);
 };
}
const input={txId,logIndex:7,assignedAddress:'0x0000000000000000000000000000000000000002',maxAmountBaseUnits:100n*10n**18n,minimumConfirmations:15};
async function main(){
 const observed=await observeBep20UsdtReceipt(transport(),input);assert.equal(observed.event.amountBaseUnits,(20n*10n**18n).toString());
 // Exercise the real bounded HTTP/JSON-RPC adapter + observer together, without outbound access.
 const methods:string[]=[];const underlying=transport();
 const httpFetch=(async(_url,init)=>{
  const body=JSON.parse(String(init!.body));methods.push(body.method);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:await underlying(body.method,body.params)}),{headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 const integrated=await observeBep20UsdtReceipt(createBep20ReadRpc({endpoint:'https://rpc.example.invalid',fetch:httpFetch}),input);
 assert.deepEqual(integrated,observed);
 assert.deepEqual(methods,['eth_chainId','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getBlockByNumber','eth_blockNumber','eth_getBlockByNumber']);

 for(const alter of [
  (m:string,p:unknown[],v:unknown)=>m==='eth_chainId'?'0x1':v,
  (m:string,p:unknown[],v:unknown)=>m==='eth_getTransactionReceipt'?null:v,
  (m:string,p:unknown[],v:unknown)=>m==='eth_getTransactionReceipt'?{...receipt,status:'0x0'}:v,
  (m:string,p:unknown[],v:unknown)=>m==='eth_getTransactionReceipt'?{...receipt,logs:[{...log,transactionHash:other}]}:v,
  (m:string,p:unknown[],v:unknown)=>m==='eth_getTransactionReceipt'?{...receipt,logs:[{...log,removed:true}]}:v,
  (m:string,p:unknown[],v:unknown)=>m==='eth_getBlockByNumber'&&p[0]==='0x64'?{...block,transactions:[other]}:v,
  (m:string,p:unknown[],v:unknown)=>m==='eth_getBlockByNumber'&&p[0]==='finalized'?null:v,
  (m:string,p:unknown[],v:unknown)=>m==='eth_getBlockByNumber'&&p[0]==='finalized'?{hash:other,number:'0x63'}:v,
  (m:string,p:unknown[],v:unknown)=>m==='eth_blockNumber'?'0x064':v,
  (m:string,p:unknown[],v:unknown,c:number)=>c===6?{...block,hash:other}:v,
 ])await assert.rejects(()=>observeBep20UsdtReceipt(transport(alter),input));
 console.log('Read-only BEP20 observer passed: chain, receipt/block/log binding, finalized-tag requirement, quantity encoding and reorg recheck. Mock transport only.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
