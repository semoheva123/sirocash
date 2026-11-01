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
 const calls:string[]=[];
 const split=createBep20DepositReadRpc({endpoint,authorization:'Bearer primary',fetch:mock((b,i)=>{calls.push('primary:'+b.method);assert.equal((i.headers as Record<string,string>).Authorization,'Bearer primary');return json({jsonrpc:'2.0',id:b.id,result:'primary-proof'})})},{endpoint:'https://logs.example.invalid',fetch:mock((b,i)=>{calls.push('logs:'+b.method);assert.equal((i.headers as Record<string,string>).Authorization,undefined);return json({jsonrpc:'2.0',id:b.id,result:b.method==='eth_chainId'?'0x38':[]})})});
 assert.deepEqual(await split('eth_getLogs',[filter]),[]);assert.equal(await split('eth_getTransactionReceipt',['0x'+'a'.repeat(64)]),'primary-proof');
 assert.deepEqual(calls,['logs:eth_chainId','logs:eth_getLogs','primary:eth_getTransactionReceipt']);
 const wrong=createBep20DepositReadRpc({endpoint,fetch:good},{endpoint:'https://logs.example.invalid',fetch:mock(b=>json({jsonrpc:'2.0',id:b.id,result:'0x1'}))});
 await assert.rejects(()=>wrong('eth_getLogs',[filter]),/LOG_WRONG_CHAIN/);
 const failed=createBep20DepositReadRpc({endpoint,fetch:good},{endpoint:'https://logs.example.invalid',fetch:mock(()=>{throw Error('secret')})});
 await assert.rejects(()=>failed('eth_getLogs',[filter]),/RPC_TRANSPORT_FAILURE/);
 const previous=process.env.SIRO_RPC_READ_ENABLED;delete process.env.SIRO_RPC_READ_ENABLED;assert.throws(()=>productionBep20ReadRpc(),/LIVE_READ_DISABLED/);if(previous!==undefined)process.env.SIRO_RPC_READ_ENABLED=previous;
 console.log('BEP20 read RPC transport passed: strict read-only calls, HTTPS config, no-store/no-redirect, bounded responses, request/body deadlines, envelope IDs, sanitized errors and disabled production gate. No live RPC used.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
