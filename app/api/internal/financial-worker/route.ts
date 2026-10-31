import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {financialDatabase} from '@/lib/financial-database';
import {productionOutboxNetworkWorkers} from '@/lib/outbox-network-runtime';
import {securityFailure,securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
/** Scheduler trigger only; no command, transaction, destination or evidence in its input. */
export async function POST(request:Request){
 const secret=process.env.SIRO_FINANCIAL_WORKER_SECRET??'',provided=request.headers.get('authorization')??'',expected='Bearer '+secret;
 if(secret.length<32||secret.length>512||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return securityFailure('غير مصرّح بهذا الإجراء.',401);
 if(process.env.SIRO_OUTBOX_WORKER_ENABLED!=='true'||process.env.VERCEL_ENV!=='production')return securityFailure('المعالجة المالية غير مفعّلة.',503);
 try{
  const result=await productionOutboxNetworkWorkers(financialDatabase()).batch();
  return NextResponse.json(result,{headers:securityHeaders}); // Counts only; no IDs, payloads, secrets or provider errors.
 }catch{return securityFailure('تعذّرت المعالجة المالية الآمنة.',503)}
}

/** Authentication-only probe. Never opens a DB connection or invokes the worker. */
export async function GET(request:Request){
 const secret=process.env.SIRO_FINANCIAL_WORKER_SECRET??'',provided=request.headers.get('authorization')??'',expected='Bearer '+secret;
 if(secret.length<32||secret.length>512||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return securityFailure('غير مصرّح بهذا الإجراء.',401);
 return new NextResponse(null,{status:204,headers:securityHeaders});
}
