/** Read-only single-flight synchronization. Never retries a financial command. */
export type SyncState='syncing'|'current'|'retrying'|'paused'|'unauthenticated';
export class SessionExpired extends Error {}
export function createReadSynchronizer<T>(o:{read:(signal:AbortSignal)=>Promise<T>;data:(data:T)=>void;state:(state:SyncState)=>void;active:()=>boolean;setTimer?:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;clearTimer?:(id:ReturnType<typeof setTimeout>)=>void}){
 const timer=o.setTimer??setTimeout,clear=o.clearTimer??clearTimeout;
 let stopped=false,terminal=false,generation=0,failures=0,flight:Promise<void>|undefined,next:ReturnType<typeof setTimeout>|undefined,cancel:(()=>void)|undefined;
 const clearNext=()=>{if(next!==undefined)clear(next);next=undefined};
 async function run():Promise<void>{
  if(stopped||terminal)return;
  if(flight)return flight;
  clearNext();if(!o.active()){o.state('paused');return}
  const epoch=generation,abort=new AbortController();o.state('syncing');
  flight=(async()=>{
   let deadline:ReturnType<typeof setTimeout>|undefined;
   try{
    const expired=new Promise<never>((_,reject)=>{cancel=()=>{abort.abort();reject(Error('READ_CANCELLED'))};deadline=timer(()=>{abort.abort();reject(Error('READ_TIMEOUT'))},8000)});
    const value=await Promise.race([expired,Promise.resolve().then(()=>o.read(abort.signal))]);
    if(stopped||epoch!==generation)return;
    failures=0;o.data(value);o.state('current');
   }catch(e){
    if(stopped||epoch!==generation)return;
    if(e instanceof SessionExpired){terminal=true;o.state('unauthenticated');return}
    failures++;o.state('retrying');throw e;
   }finally{
    if(deadline!==undefined)clear(deadline);cancel=undefined;flight=undefined;
    if(!stopped&&!terminal&&epoch===generation&&o.active())next=timer(()=>{void run().catch(()=>{})},failures?Math.min(60000,5000*2**Math.min(failures,4)):5000);
   }
  })();
  return flight;
 }
 return {
  // After a mutation, wait for an older read and request a fresh snapshot. Never reuse
  // a response that could have been taken before the mutation committed.
  async refresh(){if(flight)await flight.catch(()=>{});await run()},
  wake(){void this.refresh().catch(()=>{})},
  pause(){generation++;clearNext();cancel?.();if(!stopped&&!terminal)o.state('paused')},
  stop(){stopped=true;generation++;clearNext();cancel?.()},
 };
}
