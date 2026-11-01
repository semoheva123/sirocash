import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {financialDatabase} from '@/lib/financial-database';
import {assertDepositOnlyIsolation} from '@/lib/deposit-only-mode';
import {productionDepositOnlyWorkers} from '@/lib/deposit-only-runtime';
import {securityFailure,securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
/** No caller-controlled commands, addresses or evidence. Never composes external execution. */
export async function POST(request:Request){
 const secret=process.env.SIRO_FINANCIAL_WORKER_SECRET??'',provided=request.headers.get('authorization')??'',expected='Bearer '+secret;
 if(secret.length<32||secret.length>512||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return securityFailure('غير مصرّح بهذا الإجراء.',401);
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_OUTBOX_WORKER_ENABLED!=='true')return securityFailure('مراقبة الإيداعات غير مفعّلة.',503);
 try{
  assertDepositOnlyIsolation(); // Reject every signing/withdrawal conflict BEFORE opening the database.
  const result=await productionDepositOnlyWorkers(financialDatabase()).batch();
  return NextResponse.json(result,{headers:securityHeaders});
 }catch{return securityFailure('تعذّرت مراقبة الإيداعات الآمنة.',503)}
}
