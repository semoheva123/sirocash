/** One dedicated database listener per server instance; authenticated owner-scoped fan-out.
 * Payloads can only invalidate. They never become customer data or financial commands. */
export function createFinancialChangeHub(connect:(notify:(payload:string)=>void,lost:()=>void)=>Promise<()=>Promise<void>>){
 const subscribers=new Map<symbol,{ownerId:string;changed:()=>void;lost:()=>void}>();
 let connection:Promise<()=>Promise<void>>|undefined,version=0;
 function notify(payload:string){let ownerId:unknown;try{ownerId=JSON.parse(payload).ownerId}catch{return}if(typeof ownerId!=='string')return;for(const s of subscribers.values())if(s.ownerId===ownerId)s.changed()}
 function lost(){version++;const old=connection;connection=undefined;const all=[...subscribers.values()];subscribers.clear();for(const s of all)s.lost();void old?.then(close=>close()).catch(()=>{})}
 return {async subscribe(ownerId:string,changed:()=>void,onLost:()=>void){
  const key=Symbol();subscribers.set(key,{ownerId,changed,lost:onLost});
  if(!connection){const epoch=++version;connection=Promise.resolve().then(()=>connect(payload=>{if(epoch===version)notify(payload)},()=>{if(epoch===version)lost()}))}
  const pending=connection;
  try{await pending;if(connection!==pending||!subscribers.has(key))throw Error('EVENT_CONNECTION_LOST')}
  catch(e){subscribers.delete(key);if(connection===pending)lost();throw e}
  let removed=false;
  return ()=>{if(removed)return;removed=true;subscribers.delete(key);if(!subscribers.size&&connection===pending){connection=undefined;version++;void pending.then(close=>close()).catch(()=>{})}};
 }};
}
