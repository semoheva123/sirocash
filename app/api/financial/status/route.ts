import {readFinancialSnapshot} from '@/lib/financial-status';
import {NextResponse} from 'next/server';
import {currentUser,sessionTokenHash} from '@/lib/email-auth';
import {customerFinanceEnabled,customerWithdrawalsEnabled} from '@/lib/customer-financial-http';
import {financialDatabase} from '@/lib/financial-database';
import {assertDurableSession} from '@/lib/durable-passkey';
import {securityFailure,securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const user=await currentUser(request);
  if(!user)return securityFailure('يتطلب تسجيل الدخول.',401);
  if(!customerFinanceEnabled())return NextResponse.json({enabled:false,userId:user.id},{headers:securityHeaders});
  const sessionHash=sessionTokenHash(request),origin=process.env.WEBAUTHN_ORIGIN;
  if(!sessionHash||!origin)throw Error();
  const data=await financialDatabase().transaction(async tx=>{
   await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   await assertDurableSession(tx,{userId:user.id,sessionHash,origin,rpID:new URL(origin).hostname});
   return readFinancialSnapshot(tx,user.id);
  });
  return NextResponse.json({enabled:true,userId:user.id,capabilities:{withdrawals:customerWithdrawalsEnabled(),deposits:process.env.SIRO_CUSTOMER_DEPOSITS_ENABLED==='true'&&process.env.SIRO_DEPOSIT_DISCOVERY_ENABLED==='true'&&process.env.SIRO_DEPOSIT_VALUATION_ENABLED==='true'&&process.env.SIRO_PRICING_PROVIDER==='coinbase-spot-v1'},...data},{headers:securityHeaders});
 }catch(error){if(error instanceof Error&&error.message==='PASSKEY_SESSION_EXPIRED')return securityFailure('انتهت صلاحية الجلسة.',403);return securityFailure('تعذّر تحميل الحالة المالية للحساب.',503)}
}
