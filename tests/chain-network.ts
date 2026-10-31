import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {TronWeb} from 'tronweb';
import {productionOutboxNetworkWorkers} from '../lib/outbox-network-runtime';
import {chainJsonPost} from '../lib/chain-http';
import {createChainBroadcaster,productionChainBroadcaster} from '../lib/chain-broadcast';
import {createTronRead,observeTronUsdtReceipt,type TronRead} from '../lib/tron-receipt-observer';
import {observeOutboxTransfer} from '../lib/outbox-observer';
import {signBep20Usdt,signTrc20Usdt} from '../lib/vercel-treasury-signer';
import {tronUsdtContract} from '../lib/tron-deposit-verification';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
const key='01'.repeat(32),other='02'.repeat(32); // Public fixtures: NEVER fund.
const genesis='0'.repeat(16)+'aa'.repeat(24),hash=(n:number,s='cd')=>n.toString(16).padStart(16,'0')+s.repeat(24);
const topic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const to=String(TronWeb.address.fromPrivateKey(other)),from=String(TronWeb.address.fromPrivateKey(key));
const topicAddress=(v:string)=>TronWeb.address.toHex(v).slice(2).toLowerCase().padStart(64,'0');
const txId='ab'.repeat(32);
const log={address:TronWeb.address.toHex(tronUsdtContract).slice(2).toLowerCase(),topics:[topic,topicAddress(from),topicAddress(to)],data:(15000000n).toString(16).padStart(64,'0')};
const info={id:txId,blockNumber:100,receipt:{result:'SUCCESS'},log:[log]};
const block={blockID:hash(100),block_header:{raw_data:{number:100}},transactions:[{txID:txId,ret:[{contractRet:'SUCCESS'}]}]};
function read(change:(p:string,b:Record<string,unknown>,v:unknown,n:number)=>unknown=(_p,_b,v)=>v):TronRead{
 let calls=0;return async(p,b)=>{calls++;const value=p.endsWith('gettransactioninfobyid')?info:p.endsWith('getnowblock')?{blockID:hash(110),block_header:{raw_data:{number:110}}}:b.num===0?{blockID:genesis,block_header:{raw_data:{number:0}}}:block;return change(p,b,structuredClone(value),calls)};
}
async function main(){
 assert.throws(()=>productionChainBroadcaster(),/DISABLED/);
 assert.throws(()=>productionOutboxNetworkWorkers({transaction:async()=>{throw new Error('must not access DB')}}),/DISABLED/);
 for(const endpoint of ['http://rpc.example.invalid','https://127.0.0.1','https://localhost','https://user:pass@rpc.example.invalid','https://[::1]'])assert.throws(()=>chainJsonPost({endpoint}),/CONFIGURATION/);
 const calls:{url:string;body:string}[]=[];
 const mock=(async(url,init)=>{const body=String(init?.body);calls.push({url:String(url),body});const p=JSON.parse(body);return new Response(JSON.stringify(p.method?{jsonrpc:'2.0',id:p.id,result:p.method==='eth_chainId'?'0x38':p.params[0]}:{blockID:genesis}),{headers:{'content-type':'application/json'}})}) as typeof fetch;
 const opts={bep20:{endpoint:'https://bsc.example.invalid',fetch:mock},tron:{endpoint:'https://tron.example.invalid',fetch:mock},tronGenesisId:genesis};
 assert.throws(()=>createChainBroadcaster(opts),/DISABLED/);
 const evmFrom=new Wallet('0x'+key).address,evmTo=new Wallet('0x'+other).address;
 const bsc=await signBep20Usdt(key,{expectedSender:evmFrom,maxAmountBaseUnits:10n**20n,maxNetworkFeeBaseUnits:10n**18n},{destination:evmTo,amountBaseUnits:10n**18n,nonce:7,gasLimit:70000n,gasPrice:1000000000n});
 const bscInput={network:'BEP20' as const,txId:bsc.txId,signedPayload:bsc.serialized,signal:new AbortController().signal};
 let sentBytes='';
 const bscFetch=(async(_url,init)=>{const p=JSON.parse(String(init!.body));if(p.method==='eth_sendRawTransaction'){sentBytes=p.params[0];return new Response(JSON.stringify({jsonrpc:'2.0',id:p.id,result:bsc.txId}),{headers:{'content-type':'application/json'}})}return new Response(JSON.stringify({jsonrpc:'2.0',id:p.id,result:'0x38'}),{headers:{'content-type':'application/json'}})}) as typeof fetch;
 const send=createChainBroadcaster({...opts,enabled:true,bep20:{...opts.bep20,fetch:bscFetch}});
 assert.deepEqual(await send(bscInput),{txId:bsc.txId});assert.equal(sentBytes,bsc.serialized);
 await assert.rejects(()=>send({...bscInput,txId:'0x'+'ef'.repeat(32)}),/UNCERTAIN/);
 for(const result of ['0x1','0x38']){
  let sends=0;const failing=(async(_u,init)=>{const p=JSON.parse(String(init!.body));if(p.method!=='eth_chainId')sends++;return new Response(JSON.stringify({jsonrpc:'2.0',id:p.id,result}),{headers:{'content-type':'application/json'}})}) as typeof fetch;
  await assert.rejects(()=>createChainBroadcaster({...opts,enabled:true,bep20:{endpoint:opts.bep20.endpoint,fetch:failing}})(bscInput),/UNCERTAIN/);assert.equal(sends,result==='0x1'?0:1);
 }
 const now=Date.now();const tron=signTrc20Usdt(key,{expectedSender:from,maxAmountBaseUnits:20000000n,maxNetworkFeeBaseUnits:5000000n},{destination:to,amountBaseUnits:15000000n,refBlockBytes:'1234',refBlockHash:'ab'.repeat(8),timestamp:now,expiration:now+60000,feeLimitSun:4000000},now);
 const tronPayload=JSON.stringify(tron.transaction);let tronBytes='';
 const tronFetch=(async(url,init)=>{if(String(url).endsWith('broadcasttransaction')){tronBytes=String(init!.body);return new Response(JSON.stringify({result:true,txid:tron.txId}),{headers:{'content-type':'application/json'}})}return new Response(JSON.stringify({blockID:genesis}),{headers:{'content-type':'application/json'}})}) as typeof fetch;
 assert.deepEqual(await createChainBroadcaster({...opts,enabled:true,tron:{endpoint:opts.tron.endpoint,fetch:tronFetch}})({network:'TRC20',txId:tron.txId,signedPayload:tronPayload,signal:new AbortController().signal}),{txId:tron.txId});assert.equal(tronBytes,tronPayload);
 const abort=new AbortController();abort.abort();await assert.rejects(()=>send({...bscInput,signal:abort.signal}),/UNCERTAIN/);
 const hanging=(async()=>new Promise(()=>{})) as typeof fetch;
 await assert.rejects(()=>chainJsonPost({endpoint:'https://rpc.example.invalid',fetch:hanging,timeoutMs:100})('/','{}'),/FAILED/);
 const hangingBody=(async()=>new Response(new ReadableStream({pull:()=>new Promise(()=>{})}),{headers:{'content-type':'application/json'}})) as typeof fetch;
 await assert.rejects(()=>chainJsonPost({endpoint:'https://rpc.example.invalid',fetch:hangingBody,timeoutMs:100})('/','{}'),/FAILED/);
 const oversized=(async()=>new Response('x'.repeat(257),{headers:{'content-type':'application/json'}})) as typeof fetch;
 await assert.rejects(()=>chainJsonPost({endpoint:'https://rpc.example.invalid',fetch:oversized,maxResponseBytes:256})('/','{}'),/FAILED/);
 const input={txId,logIndex:0,assignedAddress:to,maxAmountBaseUnits:15000000n,genesisId:genesis};
 assert.equal((await observeTronUsdtReceipt(read(),input)).event.amountBaseUnits,'15000000');
 for(const change of [
  (p:string,b:Record<string,unknown>,v:unknown)=>b.num===0?{blockID:hash(0,'bb'),block_header:{raw_data:{number:0}}}:v,
  (p:string,b:Record<string,unknown>,v:unknown)=>p.endsWith('gettransactioninfobyid')?{}:v,
  (p:string,b:Record<string,unknown>,v:unknown)=>p.endsWith('gettransactioninfobyid')?{...info,receipt:{result:'OUT_OF_ENERGY'}}:v,
  (p:string,b:Record<string,unknown>,v:unknown)=>p.endsWith('getnowblock')?{blockID:hash(99),block_header:{raw_data:{number:99}}}:v,
  (p:string,b:Record<string,unknown>,v:unknown)=>b.num===100?{...block,transactions:[]}:v,
  (p:string,b:Record<string,unknown>,v:unknown,n:number)=>n===5?{...block,blockID:hash(100,'ef')}:v,
 ])await assert.rejects(()=>observeTronUsdtReceipt(read(change),input));
 const adapter=createTronRead({endpoint:'https://tron.example.invalid',fetch:mock});
 await assert.rejects(()=>adapter('/wallet/broadcasttransaction' as never,{}),/NOT_ALLOWED/);
 await assert.rejects(()=>adapter('/walletsolidity/getblockbynum',{num:-1}),/HEIGHT/);
 const obOptions={tron:read(),bep20:async()=>{throw Error('unused')},tronGenesisId:genesis,minimumBep20Confirmations:15};
 const row={network:'TRC20',txId,sender:from,recipient:to,amountBaseUnits:'15000000'};
 assert.equal((await observeOutboxTransfer(obOptions,row)).network,'TRC20');
 await assert.rejects(()=>observeOutboxTransfer({...obOptions,tron:read((p,b,v)=>p.endsWith('gettransactioninfobyid')?{...info,log:[log,log]}:v)},row),/NOT_UNIQUE/);
 await assert.rejects(()=>observeOutboxTransfer(obOptions,{...row,amountBaseUnits:'1'}),/NOT_UNIQUE/);
 // BSC raw receipt -> candidate -> canonical/finality observer composition.
 const evmTx='0x'+txId,bh='0x'+'cd'.repeat(32),topics=['0x'+topic,'0x'+evmFrom.slice(2).toLowerCase().padStart(64,'0'),'0x'+evmTo.slice(2).toLowerCase().padStart(64,'0')];
 const evmLog={address:bep20UsdtContract,topics,data:'0x'+(10n**18n).toString(16).padStart(64,'0'),transactionHash:evmTx,transactionIndex:'0x0',blockNumber:'0x64',blockHash:bh,logIndex:'0x7',removed:false};
 const bep20=async(m:string,p:unknown[])=>m==='eth_chainId'?'0x38':m==='eth_blockNumber'?'0x78':m==='eth_getTransactionReceipt'?{transactionHash:evmTx,transactionIndex:'0x0',blockNumber:'0x64',blockHash:bh,status:'0x1',logs:[evmLog]}:p[0]==='finalized'?{number:'0x73',hash:bh}:{number:'0x64',hash:bh,transactions:[evmTx]};
 assert.equal((await observeOutboxTransfer({...obOptions,bep20},{network:'BEP20',txId:evmTx,sender:evmFrom,recipient:evmTo,amountBaseUnits:(10n**18n).toString()})).event.amountBaseUnits,(10n**18n).toString());
 console.log('Chain adapters: exact signed-byte broadcast, chain/genesis binding, abort/time/size limits; TRON solid inclusion/reorg/receipt and dual-network exact Transfer observation passed. Fixture transports only; no live signing/broadcast.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
