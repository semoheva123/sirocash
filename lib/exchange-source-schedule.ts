/** Source-only server schedule while an authenticated exchange stream is open.
 * Transport heartbeats and wallet notifications do not query or poll balances. */
export function watchPublicExchangeSchedule(wake:()=>Promise<void>,every:(tick:()=>void,ms:number)=>()=>void=(tick,ms)=>{
 const timer=setInterval(tick,ms);return()=>clearInterval(timer);
}){
 let active=true;
 const stop=every(()=>{if(active)void wake().catch(()=>{})},30000);
 return()=>{active=false;stop()};
}
