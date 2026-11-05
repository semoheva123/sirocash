import assert from 'node:assert/strict';
import {createTronIndexRead,tronIndexPageSize} from '../lib/tron-index-read';
import {createTronRead} from '../lib/tron-receipt-observer';
import {tronUsdtContract} from '../lib/tron-deposit-verification';
const address='TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL';
const json=(body:unknown,init:ResponseInit={})=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'},...init});
async function main(){
 const seen:{url:URL;init:RequestInit}[]=[];
 const ok=(async(url:URL|RequestInfo,init?:RequestInit)=>{seen.push({url:new URL(String(url)),init:init??{}});return json({data:[],success:true,meta:{at:1,page_size:0}})}) as typeof fetch;
 const read=createTronIndexRead({endpoint:'https://index.example.invalid/base/',apiKey:'k',fetch:ok});
 assert.deepEqual(await read(address,{minTimestamp:1700000000000,maxTimestamp:1700000002999}),{data:[],success:true,meta:{at:1,page_size:0}});
 const [first]=seen;
 assert.equal(first.url.origin+first.url.pathname,'https://index.example.invalid/base/v1/accounts/'+address+'/transactions/trc20');
 assert.deepEqual(Object.fromEntries(first.url.searchParams),{only_to:'true',only_confirmed:'true',contract_address:tronUsdtContract,min_timestamp:'1700000000000',max_timestamp:'1700000002999',limit:String(tronIndexPageSize),order_by:'block_timestamp,asc'});
 assert.equal(first.init.method,'GET');assert.equal(first.init.redirect,'error');
 assert.equal(new Headers(first.init.headers).get('TRON-PRO-API-KEY'),'k');
 // Fixed query: no caller-controlled fingerprint, recipient, contract or page size.
 for(const bad of [['bad-address',{minTimestamp:1,maxTimestamp:2}],[address,{minTimestamp:-1,maxTimestamp:2}],[address,{minTimestamp:5,maxTimestamp:4}],[address,{minTimestamp:0,maxTimestamp:31536000001}],[address,{minTimestamp:1.5,maxTimestamp:2}]] as const)await assert.rejects(()=>read(bad[0],bad[1]),/TRON_INDEX_INPUT/);
 for(const endpoint of ['http://index.example.invalid','https://user:pw@index.example.invalid','https://index.example.invalid/?x=1','https://localhost','https://10.0.0.1','https://[::1]'])assert.throws(()=>createTronIndexRead({endpoint,fetch:ok}),/TRON_INDEX_CONFIGURATION/);
 assert.throws(()=>createTronIndexRead({endpoint:'https://index.example.invalid',apiKey:'a\nb',fetch:ok}),/TRON_INDEX_CONFIGURATION/);
 assert.throws(()=>createTronIndexRead({endpoint:'https://index.example.invalid',throttleRetries:3,fetch:ok}),/TRON_INDEX_CONFIGURATION/);
 // Transport failures are categorised without provider text; only explicit 429 is retried.
 const failures:string[]=[];
 const failing=(response:()=>Response)=>createTronIndexRead({endpoint:'https://index.example.invalid',fetch:(async()=>response()) as typeof fetch,onFailure:f=>{failures.push(f.reason+':'+(f.httpStatus??''))}});
 await assert.rejects(()=>failing(()=>new Response('nope',{status:500}))(address,{minTimestamp:1,maxTimestamp:2}),/CHAIN_HTTP_FAILED/);
 await assert.rejects(()=>failing(()=>new Response('{"success":true}',{status:200,headers:{'content-type':'text/html'}}))(address,{minTimestamp:1,maxTimestamp:2}),/CHAIN_HTTP_FAILED/);
 await assert.rejects(()=>failing(()=>new Response('{bad',{status:200,headers:{'content-type':'application/json'}}))(address,{minTimestamp:1,maxTimestamp:2}),/CHAIN_HTTP_FAILED/);
 await assert.rejects(()=>createTronIndexRead({endpoint:'https://index.example.invalid',maxResponseBytes:256,fetch:(async()=>json({data:'x'.repeat(300)})) as typeof fetch,onFailure:f=>{failures.push(f.reason+':'+(f.httpStatus??''))}})(address,{minTimestamp:1,maxTimestamp:2}),/CHAIN_HTTP_FAILED/);
 assert.deepEqual(failures,['HTTP:500','CONTENT_TYPE:200','INVALID_JSON:200','BODY_LIMIT:200']);
 let attempts=0;
 const throttled=createTronIndexRead({endpoint:'https://index.example.invalid',throttleRetries:1,fetch:(async()=>++attempts===1?new Response('slow',{status:429}):json({success:true,data:[]})) as typeof fetch});
 assert.deepEqual(await throttled(address,{minTimestamp:1,maxTimestamp:2}),{success:true,data:[]});assert.equal(attempts,2);
 attempts=0;
 const forbidden=createTronIndexRead({endpoint:'https://index.example.invalid',throttleRetries:2,fetch:(async()=>{attempts++;return new Response('x',{status:403})}) as typeof fetch});
 await assert.rejects(()=>forbidden(address,{minTimestamp:1,maxTimestamp:2}),/CHAIN_HTTP_FAILED/);assert.equal(attempts,1,'only 429 is retried');
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(()=>createTronIndexRead({endpoint:'https://index.example.invalid',signal:aborted.signal,fetch:ok})(address,{minTimestamp:1,maxTimestamp:2}),/CHAIN_HTTP_FAILED/);
 // Header-only solidified block reads join the TRON read allowlist; nothing else widens.
 const headers:unknown[]=[];
 const tron=createTronRead({endpoint:'https://tron.example.invalid',fetch:(async(_url,init)=>{headers.push(JSON.parse(String(init?.body)));return json({blockID:'0'.repeat(64),block_header:{raw_data:{number:0,timestamp:1}}})}) as typeof fetch});
 await tron('/walletsolidity/getblock',{detail:false});await tron('/walletsolidity/getblock',{id_or_num:'87741244',detail:false});
 assert.deepEqual(headers,[{detail:false},{id_or_num:'87741244',detail:false}]);
 for(const body of [{},{detail:true},{id_or_num:'1'},{id_or_num:1,detail:false},{id_or_num:'0x1',detail:false},{id_or_num:'01',detail:false},{id_or_num:'0'.repeat(64),detail:false},{id_or_num:'1',detail:false,visible:true}])await assert.rejects(()=>tron('/walletsolidity/getblock',body),/NOT_ALLOWED/);
 console.log('TRON index read PASS: fixed recipient-filtered query, HTTPS/operator-only endpoint, bounded JSON body, categorised failures, 429-only retry, abort, and header-only block allowlist. Fixture transports only; no live network.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
