import 'server-only';
/** Operator-only HTTPS JSON transport. No URL/header may come from a public command. */
export type ChainHttpOptions={endpoint:string;authorization?:string;apiKey?:string;fetch?:typeof fetch;timeoutMs?:number;maxResponseBytes?:number};
export function chainJsonPost(options:ChainHttpOptions){
 let endpoint:URL;try{endpoint=new URL(options.endpoint)}catch{throw new Error('CHAIN_HTTP_CONFIGURATION')}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash||endpoint.hostname==='localhost'||endpoint.hostname.endsWith('.localhost')||endpoint.hostname.endsWith('.local')||endpoint.hostname.includes(':')||/^\d+(?:\.\d+){3}$/.test(endpoint.hostname))throw new Error('CHAIN_HTTP_CONFIGURATION');
 const timeout=options.timeoutMs??10000,maxBytes=options.maxResponseBytes??2097152;
 if(!Number.isSafeInteger(timeout)||timeout<100||timeout>30000||!Number.isSafeInteger(maxBytes)||maxBytes<256||maxBytes>8388608)throw new Error('CHAIN_HTTP_CONFIGURATION');
 for(const h of [options.authorization,options.apiKey])if(h!==undefined&&(!h||h.length>8192||/[\r\n]/.test(h)))throw new Error('CHAIN_HTTP_CONFIGURATION');
 const request=options.fetch??fetch;
 return async(path:string,body:string,signal?:AbortSignal):Promise<unknown>=>{
  // Paths are fixed by the enclosing allowlisted adapter, not arbitrary caller input.
  if(!/^\/[a-z0-9/]*$/.test(path)||body.length>262144)throw new Error('CHAIN_HTTP_INPUT');
  const target=new URL(endpoint);target.pathname=endpoint.pathname.replace(/\/$/,'')+(path==='/'?'':path);
  const abort=new AbortController();let rejectAbort:(e:Error)=>void=()=>{};
  const expired=new Promise<never>((_,reject)=>{rejectAbort=reject});
  const cancel=()=>{abort.abort();rejectAbort(new Error('CHAIN_HTTP_ABORTED'))};
  const timer=setTimeout(cancel,timeout);signal?.addEventListener('abort',cancel,{once:true});
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{
   if(signal?.aborted)throw new Error('CHAIN_HTTP_ABORTED');
   const response=await Promise.race([expired,request(target,{method:'POST',redirect:'error',cache:'no-store',signal:abort.signal,headers:{'Content-Type':'application/json',Accept:'application/json',...(options.authorization?{Authorization:options.authorization}:{}),...(options.apiKey?{'TRON-PRO-API-KEY':options.apiKey}:{})},body})]);
   if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||!response.body)throw new Error('CHAIN_HTTP_RESPONSE');
   const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||BigInt(length)>BigInt(maxBytes)))throw new Error('CHAIN_HTTP_RESPONSE');
   reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
   for(;;){const part=await Promise.race([expired,reader.read()]);if(part.done)break;size+=part.value.byteLength;if(size>maxBytes)throw new Error('CHAIN_HTTP_RESPONSE');chunks.push(part.value)}
   const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
  }catch{throw new Error('CHAIN_HTTP_FAILED')}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);abort.abort();if(reader)void reader.cancel().catch(()=>{})}
 };
}
