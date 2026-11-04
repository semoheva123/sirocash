import {exchangeSnapshotSchema,type ExchangeSnapshot} from './exchange-reference';
import {STATIC_EXCHANGE_URL} from './static-exchange-location';
export {STATIC_EXCHANGE_URL} from './static-exchange-location';
/** Public CDN only. Never use wallet endpoints, cookies, SSE, or financial credentials. */
export function createStaticExchangeReader(o:{active:()=>boolean;data:(snapshot:ExchangeSnapshot)=>void;unavailable:()=>void;fetch?:typeof fetch;timer?:typeof setTimeout;clear?:typeof clearTimeout;now?:()=>number}){
 const fetcher=o.fetch??fetch,timer=o.timer??setTimeout,clear=o.clear??clearTimeout,now=o.now??Date.now;
 let stopped=false,busy=false,next=0,scheduled:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
 async function wake(){
  if(stopped||busy||!o.active())return;
  if(now()<next){if(scheduled===undefined)scheduled=timer(()=>{scheduled=undefined;void wake()},Math.max(1000,next-now()));return;}
  busy=true;next=now()+15*60*1000;controller=new AbortController();const request=controller;
  const timeout=timer(()=>request.abort(),5000);
  try{
   const response=await fetcher(STATIC_EXCHANGE_URL,{credentials:'omit',mode:'cors',redirect:'error',cache:'default',signal:request.signal,referrerPolicy:'no-referrer'});
   if(!response.ok||Number(response.headers.get('content-length')??0)>16384)throw Error('UNAVAILABLE');
   if(!response.body)throw Error('UNAVAILABLE');
   const reader=response.body.getReader();let size=0;const decoder=new TextDecoder();let text='';
   try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>16384)throw Error('OVERSIZE');text+=decoder.decode(chunk.value,{stream:true})}text+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}
   const snapshot=exchangeSnapshotSchema.parse(JSON.parse(text));
   const age=now()-Date.parse(snapshot.fetchedAt);
   if(new Set(snapshot.fx.map(q=>q.pair)).size!==snapshot.fx.length)throw Error('DUPLICATE_PAIR');
   if(snapshot.observation!=='public-page'||snapshot.city!=='syria-general'||age < -300000||age>86400000)throw Error('STALE_OR_UNTRUSTED');
   if(!stopped&&!request.signal.aborted)o.data(snapshot);
  }catch{if(!stopped&&o.active())o.unavailable()}
  finally{clear(timeout);busy=false;if(!stopped&&o.active()){if(scheduled!==undefined)clear(scheduled);scheduled=timer(()=>{scheduled=undefined;void wake()},Math.max(1000,next-now()))}}
 }
 return {wake:()=>{void wake()},pause(){controller?.abort();if(scheduled!==undefined)clear(scheduled);scheduled=undefined},stop(){stopped=true;controller?.abort();if(scheduled!==undefined)clear(scheduled)}};
}
