// A deadline covers response headers AND body. No retry: timed-out writes may have committed.
export async function clientRequest(input:RequestInfo|URL,init:RequestInit={},timeoutMs=20_000):Promise<Response>{
 const controller=new AbortController(),outer=init.signal;
 let timer:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{};
 const cancelled=new Promise<never>((_resolve,reject)=>{
  abort=()=>{controller.abort(outer?.reason);reject(outer?.reason??new DOMException('Request aborted','AbortError'))};
  timer=setTimeout(()=>{controller.abort();reject(new DOMException('Timed out waiting for response','TimeoutError'))},timeoutMs);
  outer?.addEventListener('abort',abort,{once:true});if(outer?.aborted)abort();
 });
 try{
  return await Promise.race([cancelled,(async()=>{
   if(controller.signal.aborted)throw controller.signal.reason;
   const response=await fetch(input,{...init,signal:controller.signal}),body=await response.arrayBuffer();
   return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
  })()]);
 }finally{clearTimeout(timer);outer?.removeEventListener('abort',abort)}
}
