const encoder=new TextEncoder();
/** SSE snapshots are sent on connection and committed database changes, never a read loop. */
export function financialEventResponse(request:Request,o:{
 authenticate:()=>Promise<{id:string}|null>;enabled:()=>boolean;expiresAt:(userId:string)=>Promise<Date|null>;
 subscribe:(ownerId:string,changed:()=>void,lost:()=>void)=>Promise<()=>void>;snapshot:()=>Promise<Response>;
 setInterval?:typeof setInterval;clearInterval?:typeof clearInterval;setTimeout?:typeof setTimeout;clearTimeout?:typeof clearTimeout;
}){
 const setInterval=o.setInterval??globalThis.setInterval,clearInterval=o.clearInterval??globalThis.clearInterval,setTimeout=o.setTimeout??globalThis.setTimeout,clearTimeout=o.clearTimeout??globalThis.clearTimeout;
 let cleanup=()=>{};
 const stream=new ReadableStream<Uint8Array>({
  start(controller){
   let done=false,unsubscribe:(()=>void)|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,deadline:ReturnType<typeof setTimeout>|undefined,expiry:ReturnType<typeof setTimeout>|undefined;
   const finish=()=>{if(done)return;done=true;unsubscribe?.();if(heartbeat)clearInterval(heartbeat);if(deadline)clearTimeout(deadline);if(expiry)clearTimeout(expiry);request.signal.removeEventListener('abort',finish);try{controller.close()}catch{}};
   cleanup=finish;request.signal.addEventListener('abort',finish,{once:true});
   const send=(event:string,data:unknown)=>{if(done)return;if((controller.desiredSize??0)<=0){finish();return}try{controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))}catch{finish()}};
   const fail=()=>{send('unavailable',{});finish()};
   let reading=false,dirty=false;
   const publish=async()=>{
    dirty=true;if(reading||done)return;reading=true;
    try{while(dirty&&!done){dirty=false;const response=await o.snapshot();if(done)break;if(response.status===401||response.status===403){send('session-ended',{});finish();break}if(!response.ok)throw Error('SNAPSHOT_UNAVAILABLE');send('snapshot',await response.json())}}
    catch{fail()}finally{reading=false}
   };
   deadline=setTimeout(()=>{send('reconnect',{});finish()},270000);
   void (async()=>{
    try{
     if(request.signal.aborted){finish();return}
     if(request.headers.get('sec-fetch-site')==='cross-site'){send('session-ended',{});finish();return}
     const user=await o.authenticate();if(done)return;if(!user){send('session-ended',{});finish();return}
     if(!o.enabled()){await publish();send('disabled',{});finish();return}
     const session=await o.expiresAt(user.id);
     if(!session){send('session-ended',{});finish();return}
     const off=await o.subscribe(user.id,()=>{void publish()},fail);
     if(done){off();return}unsubscribe=off;
     expiry=setTimeout(()=>{send('session-ended',{});finish()},Math.min(2147483647,Math.max(0,session.getTime()-Date.now())));
     // Transport keepalive only. No balance/status/database queries on a heartbeat.
     heartbeat=setInterval(()=>send('heartbeat',{}),15000);

     // Subscribe-before-snapshot + dirty drain closes the initial/reconnect race.
     await publish();
    }catch{fail()}
   })();
  },cancel(){cleanup()},
 });
 return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'}});
}
