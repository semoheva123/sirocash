import 'server-only';
import type {ChainHttpFailure} from './chain-http';
import {validTronAddress} from './tron-addresses';
import {tronUsdtContract} from './tron-deposit-verification';
/** Operator-only, read-only TronGrid indexed TRC20 history. Recipient-filtered discovery of
 * USDT transfers INTO platform addresses. Results are candidates only (same trust class as the
 * BEP20 eth_getLogs recipient filter): every credit still passes the canonical solidified
 * receipt observer. No signing, broadcast, customer input, URL or header from a public command.
 */
export const tronIndexPageSize=200;
export type TronIndexQuery={minTimestamp:number;maxTimestamp:number};
export type TronIndexRead=(address:string,query:TronIndexQuery)=>Promise<unknown>;
export type TronIndexOptions={endpoint:string;apiKey?:string;fetch?:typeof fetch;signal?:AbortSignal;timeoutMs?:number;maxResponseBytes?:number;throttleRetries?:number;onFailure?:(failure:ChainHttpFailure)=>void};
export function createTronIndexRead(options:TronIndexOptions):TronIndexRead{
 let endpoint:URL;try{endpoint=new URL(options.endpoint)}catch{throw new Error('TRON_INDEX_CONFIGURATION')}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash||endpoint.search||endpoint.hostname==='localhost'||endpoint.hostname.endsWith('.localhost')||endpoint.hostname.endsWith('.local')||endpoint.hostname.includes(':')||/^\d+(?:\.\d+){3}$/.test(endpoint.hostname))throw new Error('TRON_INDEX_CONFIGURATION');
 const timeout=options.timeoutMs??10000,maxBytes=options.maxResponseBytes??1048576,retries=options.throttleRetries??0;
 if(!Number.isSafeInteger(timeout)||timeout<100||timeout>30000||!Number.isSafeInteger(maxBytes)||maxBytes<256||maxBytes>4194304||!Number.isSafeInteger(retries)||retries<0||retries>2)throw new Error('TRON_INDEX_CONFIGURATION');
 if(options.apiKey!==undefined&&(!options.apiKey||options.apiKey.length>8192||/[\r\n]/.test(options.apiKey)))throw new Error('TRON_INDEX_CONFIGURATION');
 const request=options.fetch??fetch;
 const wait=(ms:number)=>new Promise<void>((resolve,reject)=>{
  if(options.signal?.aborted){reject(new Error('CHAIN_HTTP_FAILED'));return}
  const timer=setTimeout(()=>{options.signal?.removeEventListener('abort',cancel);resolve()},ms);
  const cancel=()=>{clearTimeout(timer);reject(new Error('CHAIN_HTTP_FAILED'))};
  options.signal?.addEventListener('abort',cancel,{once:true});
 });
 const once=async(target:URL):Promise<{value?:unknown;failure?:ChainHttpFailure}>=>{
  const abort=new AbortController();let rejectAbort:(e:Error)=>void=()=>{};
  const expired=new Promise<never>((_,reject)=>{rejectAbort=reject});
  const cancel=()=>{abort.abort();rejectAbort(new Error('CHAIN_HTTP_ABORTED'))};
  const timer=setTimeout(cancel,timeout);options.signal?.addEventListener('abort',cancel,{once:true});
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  let failure:ChainHttpFailure={reason:'TRANSPORT'};
  try{
   if(options.signal?.aborted)throw new Error('CHAIN_HTTP_ABORTED');
   const response=await Promise.race([expired,request(target,{method:'GET',redirect:'error',cache:'no-store',signal:abort.signal,headers:{Accept:'application/json',...(options.apiKey?{'TRON-PRO-API-KEY':options.apiKey}:{})}})]);
   failure={reason:!response.ok?'HTTP':'CONTENT_TYPE',httpStatus:response.status};
   if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||!response.body)throw new Error('CHAIN_HTTP_RESPONSE');
   failure={reason:'TRANSPORT',httpStatus:response.status};
   const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||BigInt(length)>BigInt(maxBytes))){failure={reason:'BODY_LIMIT',httpStatus:response.status};throw new Error('CHAIN_HTTP_RESPONSE')}
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
   for(;;){const part=await Promise.race([expired,reader.read()]);if(part.done)break;size+=part.value.byteLength;if(size>maxBytes){failure={reason:'BODY_LIMIT',httpStatus:response.status};throw new Error('CHAIN_HTTP_RESPONSE')}chunks.push(part.value)}
   const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}
   failure={reason:'INVALID_JSON',httpStatus:response.status};
   return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data))};
  }catch{return {failure:abort.signal.aborted?{reason:'TIMEOUT_OR_ABORT'}:failure}}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);abort.abort();if(reader)void reader.cancel().catch(()=>{})}
 };
 return async(address,query)=>{
  // Fixed path and query. Address must be a valid base58 TRON address; no fingerprint paging:
  // a full page means the caller must narrow its block window, never trust a partial listing.
  if(!validTronAddress(address)||!Number.isSafeInteger(query.minTimestamp)||!Number.isSafeInteger(query.maxTimestamp)||query.minTimestamp<0||query.maxTimestamp<query.minTimestamp||query.maxTimestamp-query.minTimestamp>31536000000)throw new Error('TRON_INDEX_INPUT');
  const target=new URL(endpoint);
  target.pathname=endpoint.pathname.replace(/\/$/,'')+'/v1/accounts/'+address+'/transactions/trc20';
  target.search=new URLSearchParams({only_to:'true',only_confirmed:'true',contract_address:tronUsdtContract,min_timestamp:String(query.minTimestamp),max_timestamp:String(query.maxTimestamp),limit:String(tronIndexPageSize),order_by:'block_timestamp,asc'}).toString();
  let last:ChainHttpFailure={reason:'TRANSPORT'};
  for(let attempt=0;;attempt++){
   const result=await once(target);
   if(!result.failure)return result.value;
   last=result.failure;
   // Explicit HTTP 429 only; never retry timeouts, malformed bodies or unknown outcomes.
   if(last.reason!=='HTTP'||last.httpStatus!==429||attempt>=retries||options.signal?.aborted)break;
   try{await wait(1000*(attempt+1))}catch{break}
  }
  try{options.onFailure?.(last)}catch{/* Diagnostics cannot change failure semantics. */}
  throw new Error('CHAIN_HTTP_FAILED');
 };
}
/** TronGrid indexed history for production discovery. Same operator API key as the TRON node reads. */
export function productionTronIndexRead(signal?:AbortSignal,onFailure?:TronIndexOptions['onFailure']){
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_RPC_READ_ENABLED!=='true')throw new Error('RPC_LIVE_READ_DISABLED');
 const endpoint=process.env.SIRO_TRON_INDEX_URL||'https://api.trongrid.io';
 return createTronIndexRead({endpoint,signal,onFailure,throttleRetries:2,apiKey:process.env.SIRO_TRON_RPC_API_KEY});
}
