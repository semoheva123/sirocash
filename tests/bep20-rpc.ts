import assert from 'node:assert/strict';
import {createBep20DepositReadRpc,createBep20ReadRpc,productionBep20ReadRpc} from '../lib/bep20-rpc';
const endpoint='https://rpc.example.invalid/private-api-key';
type Handler=(body:Record<string,unknown>,init:RequestInit)=>Response|Promise<Response>;
function mock(handler:Handler):typeof fetch{return (async(_url,init)=>handler(JSON.parse(String(init!.body)),init!)) as typeof fetch}
const json=(v:unknown)=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
const good=mock((body,init)=>{assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal((init.headers as Record<string,string>).Authorization,'Bearer secret');return json({jsonrpc:'2.0',id:body.id,result:'0x38'})});
async function main(){
 const rpc=createBep20ReadRpc({endpoint,authorization:'Bearer secret',fetch:good});
 assert.equal(await rpc('eth_chainId',[]),'0x38');
 for(const [method,params] of [['eth_sendRawTransaction',['0xab']],['eth_sign',[]],['eth_getBlockByNumber',['latest',false]],['eth_getBlockByNumber',['0x01',false]],['eth_getTransactionReceipt',['0xab']],['eth_chainId',['extra']]] as [string,unknown[]][])await assert.rejects(()=>rpc(method,params),/READ_METHOD_NOT_ALLOWED/);
 const filter={address:'0x55d398326f99059fF775485246999027B3197955',fromBlock:'0x1',toBlock:'0x3e8',topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',null,['0x'+'0'.repeat(64)]]};
 await rpc('eth_getLogs',[filter]);
 for(const bad of [{...filter,toBlock:'0x3e9'},{...filter,toBlock:'0x0'},{...filter,address:'0x'+'1'.repeat(40)},{...filter,topics:[filter.topics[0],null,[]]},{...filter,topics:[filter.topics[0],null,Array(65).fill('0x'+'0'.repeat(64))]}])await assert.rejects(()=>rpc('eth_getLogs',[bad]),/READ_METHOD_NOT_ALLOWED/);
 for(const url of ['http://rpc.example.invalid','https://user:password@rpc.example.invalid','https://localhost','https://127.0.0.1','https://[::1]','https://rpc.example.invalid/#secret'])assert.throws(()=>createBep20ReadRpc({endpoint:url}));
 const cases:Handler[]=[
  ()=>new Response('provider secret',{status:401}),
  ()=>new Response('secret',{headers:{'content-type':'text/html'}}),
  ()=>new Response('not-json',{headers:{'content-type':'application/json'}}),
  ()=>json([]),
  body=>json({jsonrpc:'2.0',id:'wrong',result:'0x38'}),
  body=>json({jsonrpc:'2.0',id:body.id,error:{message:'secret'}}),
  body=>json({jsonrpc:'2.0',id:body.id,result:'0x38',error:null}),
  body=>json({jsonrpc:'1.0',id:body.id,result:'0x38'}),
  ()=>{throw new Error('provider secret '+endpoint)},
  ()=>new Response('x'.repeat(300),{headers:{'content-type':'application/json','content-length':'300'}}),
  ()=>new Response('x'.repeat(300),{headers:{'content-type':'application/json'}}),
 ];
 for(const handler of cases)await assert.rejects(()=>createBep20ReadRpc({endpoint,maxResponseBytes:256,fetch:mock(handler)})('eth_chainId',[]),(e:unknown)=>e instanceof Error&&e.message.startsWith('RPC_')&&!e.message.includes('secret')&&!e.message.includes(endpoint));
 await assert.rejects(()=>createBep20ReadRpc({endpoint,timeoutMs:100,fetch:mock(()=>new Promise(()=>{}))})('eth_chainId',[]),/RPC_TIMEOUT/);
 await assert.rejects(()=>createBep20ReadRpc({endpoint,timeoutMs:100,fetch:mock(()=>new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}}))})('eth_chainId',[]),/RPC_TIMEOUT/);
 let tries=0;
 const throttle=createBep20ReadRpc({endpoint,fetch:mock(b=>++tries===1?new Response('private',{status:429,headers:{'retry-after':'0'}}):json({jsonrpc:'2.0',id:b.id,result:'0x38'}))});
 assert.equal(await throttle('eth_chainId',[]),'0x38');assert.equal(tries,2);
 tries=0;await assert.rejects(()=>createBep20ReadRpc({endpoint,fetch:mock(()=>{tries++;return new Response('private',{status:429,headers:{'retry-after':'0'}})})})('eth_chainId',[]),/RPC_HTTP_FAILURE/);assert.equal(tries,2);
 tries=0;await assert.rejects(()=>createBep20ReadRpc({endpoint,fetch:mock(()=>{tries++;return new Response('private',{status:403})})})('eth_chainId',[]),/RPC_HTTP_FAILURE/);assert.equal(tries,1);
 let failure:unknown;
 await assert.rejects(()=>createBep20ReadRpc({endpoint,onFailure:info=>{failure=info},fetch:mock(b=>json({jsonrpc:'2.0',id:b.id,error:{code:-32602,message:'invalid argument secret '+endpoint,data:'private'}}))})('eth_chainId',[]),/RPC_INVALID_ENVELOPE/);
 assert.deepEqual(failure,{method:'eth_chainId',versionMatches:true,idMatches:true,hasResult:false,hasError:true,remoteCode:-32602,reason:'PARAMS'});
 assert(!JSON.stringify(failure).includes('secret'));assert(!JSON.stringify(failure).includes(endpoint));
 await assert.rejects(()=>createBep20ReadRpc({endpoint,fetch:mock(b=>json({jsonrpc:'2.0',id:b.id,error:{code:-32005,message:'secret'}}))})('eth_chainId',[]),/RPC_RATE_LIMITED/);
 const calls:string[]=[];
 const split=createBep20DepositReadRpc({endpoint,authorization:'Bearer primary',fetch:mock((b,i)=>{calls.push('primary:'+b.method);assert.equal((i.headers as Record<string,string>).Authorization,'Bearer primary');return json({jsonrpc:'2.0',id:b.id,result:'primary-proof'})})},{endpoint:'https://logs.example.invalid',fetch:mock((b,i)=>{calls.push('logs:'+b.method);assert.equal((i.headers as Record<string,string>).Authorization,undefined);return json({jsonrpc:'2.0',id:b.id,result:b.method==='eth_chainId'?'0x38':[]})})});
 assert.deepEqual(await split('eth_getLogs',[filter]),[]);assert.equal(await split('eth_getTransactionReceipt',['0x'+'a'.repeat(64)]),'primary-proof');
 assert.deepEqual(calls,['logs:eth_chainId','logs:eth_getLogs','primary:eth_getTransactionReceipt']);
 const wrong=createBep20DepositReadRpc({endpoint,fetch:good},{endpoint:'https://logs.example.invalid',fetch:mock(b=>json({jsonrpc:'2.0',id:b.id,result:'0x1'}))});
 await assert.rejects(()=>wrong('eth_getLogs',[filter]),/LOG_WRONG_CHAIN/);
 const failed=createBep20DepositReadRpc({endpoint,fetch:good},{endpoint:'https://logs.example.invalid',fetch:mock(()=>{throw Error('secret')})});
 await assert.rejects(()=>failed('eth_getLogs',[filter]),/RPC_TRANSPORT_FAILURE/);
 const saved=process.env,originalFetch=globalThis.fetch;
 try{
  process.env={...saved,VERCEL_ENV:'production',SIRO_RPC_READ_ENABLED:'true',SIRO_BEP20_RPC_URL:'https://old.example.invalid',SIRO_BEP20_RPC_AUTHORIZATION:'Bearer must-not-leak',SIRO_BEP20_READ_RPC_URL:'https://public-read.example.invalid'};
  delete process.env.SIRO_BEP20_READ_RPC_AUTHORIZATION;
  globalThis.fetch=(async(url,init)=>{assert.equal(String(url),'https://public-read.example.invalid/');assert.equal((init!.headers as Record<string,string>).Authorization,undefined);const b=JSON.parse(String(init!.body));return json({jsonrpc:'2.0',id:b.id,result:'0x38'})}) as typeof fetch;
  assert.equal(await productionBep20ReadRpc()('eth_chainId',[]),'0x38');
 }finally{process.env=saved;globalThis.fetch=originalFetch}
 const previous=process.env.SIRO_RPC_READ_ENABLED;delete process.env.SIRO_RPC_READ_ENABLED;assert.throws(()=>productionBep20ReadRpc(),/LIVE_READ_DISABLED/);if(previous!==undefined)process.env.SIRO_RPC_READ_ENABLED=previous;
 console.log('BEP20 read RPC transport passed: strict read-only calls, HTTPS config, no-store/no-redirect, bounded responses, request/body deadlines, envelope IDs, sanitized errors and disabled production gate. No live RPC used.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
