import 'server-only';
import {randomUUID} from 'node:crypto';
import type {Bep20Rpc} from './bep20-receipt-observer';

type Options={signal?:AbortSignal;endpoint:string;authorization?:string;timeoutMs?:number;maxResponseBytes?:number;fetch?:typeof fetch};
function validateCall(method:string,params:unknown[]){
 if(!Array.isArray(params))throw new Error('RPC_READ_METHOD_NOT_ALLOWED');
 const empty=(method==='eth_chainId'||method==='eth_blockNumber')&&params.length===0;
 const receipt=method==='eth_getTransactionReceipt'&&params.length===1&&typeof params[0]==='string'&&/^0x[a-f0-9]{64}$/i.test(params[0]);
 const block=method==='eth_getBlockByNumber'&&params.length===2&&params[1]===false&&typeof params[0]==='string'&&(params[0]==='finalized'||/^0x(?:0|[1-9a-f][a-f0-9]*)$/i.test(params[0]));
 const logs=method==='eth_getLogs'&&params.length===1&&(()=>{
  const f=params[0] as Record<string,unknown>;
  if(!f||typeof f!=='object'||Object.keys(f).sort().join(',')!=='address,fromBlock,toBlock,topics'||f.address!=='0x55d398326f99059fF775485246999027B3197955'||typeof f.fromBlock!=='string'||typeof f.toBlock!=='string'||!/^0x(?:0|[1-9a-f][a-f0-9]*)$/.test(f.fromBlock)||!/^0x(?:0|[1-9a-f][a-f0-9]*)$/.test(f.toBlock))return false;
  const from=BigInt(f.fromBlock),to=BigInt(f.toBlock);
  if(to<from||to-from>=1000n||!Array.isArray(f.topics)||f.topics.length!==3||f.topics[0]!=='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'||f.topics[1]!==null)return false;
  const recipients=Array.isArray(f.topics[2])?f.topics[2]:[f.topics[2]];
  return recipients.length>0&&recipients.length<=64&&new Set(recipients).size===recipients.length&&recipients.every(v=>typeof v==='string'&&/^0x0{24}[a-f0-9]{40}$/.test(v));
 })();
 if(!empty&&!receipt&&!block&&!logs)throw new Error('RPC_READ_METHOD_NOT_ALLOWED');
}
/** Private operator-configured read-only transport. Never accept endpoint/headers from customers.
 * Errors intentionally omit URL, credentials, provider text and response content.
 */
export function createBep20ReadRpc(options:Options):Bep20Rpc{
 let endpoint:URL;try{endpoint=new URL(options.endpoint)}catch{throw new Error('RPC_CONFIGURATION_INVALID')}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash||endpoint.hostname==='localhost'||endpoint.hostname.endsWith('.localhost')||endpoint.hostname.endsWith('.local')||endpoint.hostname.includes(':')||/^\d+(?:\.\d+){3}$/.test(endpoint.hostname))throw new Error('RPC_CONFIGURATION_INVALID');
 const timeoutMs=options.timeoutMs??10000,maxBytes=options.maxResponseBytes??2097152;
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000||!Number.isSafeInteger(maxBytes)||maxBytes<256||maxBytes>8388608||
   (options.authorization!==undefined&&(!options.authorization||options.authorization.length>8192||/[\r\n]/.test(options.authorization))))throw new Error('RPC_CONFIGURATION_INVALID');
 const request=options.fetch??fetch;
 return async(method,params)=>{
  if(options.signal?.aborted)throw new Error('RPC_TIMEOUT');
  validateCall(method,params);
  const id=randomUUID(),abort=new AbortController();
  let onTimeout:()=>void=()=>{};
  const expired=new Promise<never>((_,reject)=>{onTimeout=()=>reject(new Error('RPC_TIMEOUT'));abort.signal.addEventListener('abort',onTimeout,{once:true})});
  const externalAbort=()=>abort.abort();
  options.signal?.addEventListener('abort',externalAbort,{once:true});
  const timer=setTimeout(()=>abort.abort(),timeoutMs);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{
   const response=await Promise.race([expired,request(endpoint.toString(),{method:'POST',redirect:'error',cache:'no-store',signal:abort.signal,headers:{'Content-Type':'application/json',Accept:'application/json',...(options.authorization?{Authorization:options.authorization}:{})},body:JSON.stringify({jsonrpc:'2.0',id,method,params})})]);
   if(!response.ok)throw new Error('RPC_HTTP_FAILURE');
   if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw new Error('RPC_CONTENT_TYPE_INVALID');
   const length=response.headers.get('content-length');
   if(length!==null&&(!/^\d+$/.test(length)||BigInt(length)>BigInt(maxBytes)))throw new Error('RPC_RESPONSE_TOO_LARGE');
   if(!response.body)throw new Error('RPC_EMPTY_RESPONSE');
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
   for(;;){
    // Race also bounds body readers implemented by injected transports that ignore AbortSignal.
    const next=await Promise.race([reader.read(),expired]);
    if(next.done)break;
    size+=next.value.byteLength;if(size>maxBytes)throw new Error('RPC_RESPONSE_TOO_LARGE');chunks.push(next.value);
   }
   if(abort.signal.aborted)throw new Error('RPC_TIMEOUT');
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
   let payload:unknown;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new Error('RPC_INVALID_JSON')}
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('RPC_INVALID_ENVELOPE');
   const p=payload as Record<string,unknown>;
   if(p.jsonrpc!=='2.0'||p.id!==id||Object.hasOwn(p,'error')||!Object.hasOwn(p,'result'))throw new Error('RPC_INVALID_ENVELOPE');
   return p.result;
  }catch(error){
   if(abort.signal.aborted)throw new Error('RPC_TIMEOUT');
   const safe=new Set(['RPC_HTTP_FAILURE','RPC_CONTENT_TYPE_INVALID','RPC_RESPONSE_TOO_LARGE','RPC_EMPTY_RESPONSE','RPC_TIMEOUT','RPC_INVALID_JSON','RPC_INVALID_ENVELOPE']);
   if(error instanceof Error&&safe.has(error.message))throw new Error(error.message);
   throw new Error('RPC_TRANSPORT_FAILURE');
  }finally{
   clearTimeout(timer);options.signal?.removeEventListener('abort',externalAbort);abort.signal.removeEventListener('abort',onTimeout);abort.abort();if(reader)void reader.cancel().catch(()=>{});
  }
 };
}
/** Independent read-only production gate: does not enable signing or financial writes. */
export function productionBep20ReadRpc(signal?:AbortSignal):Bep20Rpc{
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_RPC_READ_ENABLED!=='true')throw new Error('RPC_LIVE_READ_DISABLED');
 const endpoint=process.env.SIRO_BEP20_RPC_URL;if(!endpoint)throw new Error('RPC_CONFIGURATION_MISSING');
 return createBep20ReadRpc({endpoint,signal,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION});
}
