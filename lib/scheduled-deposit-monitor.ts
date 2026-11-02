import 'server-only';
import {createHash} from 'node:crypto';
import type {WalletDb} from './wallet-engine';
import {assertDepositOnlyIsolation} from './deposit-only-mode';
import {securityFailure,securityHeaders} from './security-http';
import {NextResponse} from 'next/server';
/** Narrow capability: fixed isolated monitor only. No commands or arbitrary inputs.
 * Ticket consumed and committed BEFORE work. Unknown HTTP outcomes never replay it.
 * Dependency injection supports tests without a DB, RPC or financial effects. */
export function scheduledDepositMonitor(deps:{db:()=>WalletDb;batch:(db:WalletDb)=>Promise<unknown>;env:Record<string,string|undefined>}){
 return async(request:Request)=>{
  const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')??'')?.[1];
  if(!token)return securityFailure('غير مصرّح بهذا الإجراء.',401);
  if(deps.env.VERCEL_ENV!=='production'||deps.env.SIRO_OUTBOX_WORKER_ENABLED!=='true')return securityFailure('المراقبة غير مفعّلة.',503);
  try{assertDepositOnlyIsolation(deps.env)}catch{return securityFailure('المراقبة المعزولة غير متاحة.',503)}
  try{
   const db=deps.db();
   const accepted=await db.transaction(async tx=>{
    const {rows:[row]}=await tx.query('SELECT public.consume_deposit_monitor_ticket($1) AS accepted',[createHash('sha256').update(token).digest('hex')]);
    return row?.accepted===true;
   });
   if(!accepted)return securityFailure('غير مصرّح بهذا الإجراء.',401);
   return NextResponse.json(await deps.batch(db),{headers:securityHeaders});
  }catch{return securityFailure('تعذّرت المراقبة الآمنة.',503)}
 };
}
