import {databaseFailureCategory} from './database-options';
/** Idle socket errors belong to the pool, not an unhandled process exception.
 * Never log SQL, URLs, credentials, cookies, users or provider error messages. */
export function observeDatabasePool<T extends {on(event:'error',listener:(error:unknown)=>void):unknown}>(pool:T,scope:'account'|'financial-read'|'financial-write'){
 pool.on('error',error=>console.error('DATABASE_IDLE_CONNECTION_ERROR',{scope,category:databaseFailureCategory(error)}));return pool;
}
/** Exactly one retry for a dropped connection on this session SELECT only.
 * No financial command, transaction or authentication rejection is replayed. */
export async function readSessionWithRecovery<T>(read:()=>Promise<T>,wait:()=>Promise<void>=()=>new Promise(resolve=>setTimeout(resolve,100))):Promise<T>{
 try{return await read()}catch(error){
  const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';
  if(!['ECONNRESET','EPIPE','ECONNREFUSED','57P01','57P02','57P03','08006','08003'].includes(code))throw error;
  await wait();return read();
 }
}
/** In-flight-only read deduplication, never a settled snapshot/session cache. */
export function createOwnerSnapshotReader<T>(read:(owner:string)=>Promise<T>){
 const active=new Map<string,Promise<T>>();
 return (owner:string)=>{
  const existing=active.get(owner);if(existing)return existing;
  const pending=Promise.resolve().then(()=>read(owner));active.set(owner,pending);
  void pending.finally(()=>{if(active.get(owner)===pending)active.delete(owner)}).catch(()=>{});
  return pending;
 };
}
