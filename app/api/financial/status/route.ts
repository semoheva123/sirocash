import {NextResponse} from 'next/server';
import {requireUser,sessionTokenHash} from '@/lib/email-auth';
import {customerFinanceEnabled,customerWithdrawalsEnabled} from '@/lib/customer-financial-http';
import {financialDatabase} from '@/lib/financial-database';
import {assertDurableSession} from '@/lib/durable-passkey';
import {securityFailure,securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const user=await requireUser(request);
  if(!customerFinanceEnabled())return NextResponse.json({enabled:false,userId:user.id},{headers:securityHeaders});
  const sessionHash=sessionTokenHash(request),origin=process.env.WEBAUTHN_ORIGIN;
  if(!sessionHash||!origin)throw Error();
  const data=await financialDatabase().transaction(async tx=>{
   await assertDurableSession(tx,{userId:user.id,sessionHash,origin,rpID:new URL(origin).hostname});
   const {rows:[balance]}=await tx.query(`SELECT COALESCE(a.balance,0)::text AS posted,COALESCE((SELECT SUM(w.amount) FROM "WalletOperation" w WHERE w."ownerId"=$1 AND w.kind='WITHDRAWAL' AND w.state IN ('RESERVED','SUBMITTED')),0)::text AS held FROM (SELECT $1::uuid AS owner) u LEFT JOIN "LedgerAccount" a ON a."userId"=u.owner AND a."accountType"='USER' AND a.currency='USD'`,[user.id]);
   const {rows:operations}=await tx.query('SELECT id,kind,amount::text,"feeAmount"::text,state,"createdAt" FROM "WalletOperation" WHERE "ownerId"=$1 ORDER BY "createdAt" DESC,id DESC LIMIT 30',[user.id]);
   return {balance,operations};
  });
  return NextResponse.json({enabled:true,userId:user.id,capabilities:{withdrawals:customerWithdrawalsEnabled(),deposits:process.env.SIRO_CUSTOMER_DEPOSITS_ENABLED==='true'&&process.env.SIRO_DEPOSIT_DISCOVERY_ENABLED==='true'&&process.env.SIRO_DEPOSIT_VALUATION_ENABLED==='true'&&process.env.SIRO_PRICING_PROVIDER==='coinbase-spot-v1'},...data},{headers:securityHeaders});
 }catch{return securityFailure('تعذّر تحميل الحالة المالية للحساب.',503)}
}
