export type SyncState='syncing'|'current'|'retrying'|'paused'|'unauthenticated'|'disabled';
export interface FinancialEventSource{addEventListener(type:string,listener:(event:MessageEvent)=>void):void;close():void}
/** Event-driven ONLY: timers monitor transport liveness/reconnect, never poll snapshots. */
export function createFinancialStream<T extends {enabled:boolean;userId:string;readable?:boolean}>(o:{open:()=>FinancialEventSource;active:()=>boolean;data:(d:T)=>void;state:(s:SyncState)=>void;expectedUserId?:string;setTimer?:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;clearTimer?:(id:ReturnType<typeof setTimeout>)=>void;random?:()=>number}){
 const timer=o.setTimer??setTimeout,clear=o.clearTimer??clearTimeout;
 let source:FinancialEventSource|undefined,generation=0,stopped=false,terminal=false,failures=0,retry:ReturnType<typeof setTimeout>|undefined,watchdog:ReturnType<typeof setTimeout>|undefined,waiting:{resolve:()=>void;reject:(e:Error)=>void}|undefined;
 const clearTimers=()=>{if(retry!==undefined)clear(retry);if(watchdog!==undefined)clear(watchdog);retry=watchdog=undefined};
 const disconnect=()=>{generation++;clearTimers();source?.close();source=undefined};
 const rejectWait=()=>{waiting?.reject(Error('STREAM_NOT_CURRENT'));waiting=undefined};
 function reconnect(){disconnect();rejectWait();if(stopped||terminal)return;if(!o.active()){o.state('paused');return}o.state('retrying');const base=Math.min(30000,1000*2**Math.min(failures++,5));const delay=Math.min(30000,base+Math.floor(Math.max(0,Math.min(1,(o.random??Math.random)()))*base*.25));retry=timer(()=>{retry=undefined;start()},delay)}
 function start(){
  if(stopped||terminal)return;disconnect();if(!o.active()){o.state('paused');rejectWait();return}
  o.state('syncing');const epoch=generation;
  const live=()=>!stopped&&!terminal&&epoch===generation;
  const arm=(ms=45000)=>{if(watchdog!==undefined)clear(watchdog);watchdog=timer(()=>{if(live())reconnect()},ms)};
  try{
   const s=o.open();source=s;arm();
   s.addEventListener('snapshot',e=>{
    if(!live())return;
    try{
     const d=JSON.parse(e.data) as T;if(typeof d.enabled!=='boolean'||typeof d.userId!=='string')throw Error();
     if(o.expectedUserId&&d.userId!==o.expectedUserId){endSession();return}
     const readable=d.enabled||d.readable===true;
     failures=0;o.data(d);o.state(readable?'current':'disabled');waiting?.resolve();waiting=undefined;
     if(!readable){disconnect();return}arm();
    }catch{reconnect()}
   });
   s.addEventListener('heartbeat',()=>{if(live())arm()});
   s.addEventListener('session-ended',()=>{if(live())endSession()});
   s.addEventListener('unavailable',()=>{if(live())reconnect()});
   s.addEventListener('error',()=>{if(live())reconnect()});
   s.addEventListener('reconnect',()=>{if(live())reconnect()});
  }catch{reconnect()}
 }
 function endSession(){terminal=true;disconnect();rejectWait();o.state('unauthenticated')}
 return {
  wake(){if(!source&&retry===undefined&&!stopped&&!terminal)start()},
  refresh(){if(stopped||terminal||!o.active())return Promise.reject(Error('STREAM_UNAVAILABLE'));rejectWait();const p=new Promise<void>((resolve,reject)=>{waiting={resolve,reject}});start();return p},
  pause(){disconnect();rejectWait();if(!stopped&&!terminal)o.state('paused')},
  stop(){stopped=true;disconnect();rejectWait()},
 };
}
