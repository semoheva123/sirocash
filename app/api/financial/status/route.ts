import {readOwnerFinancialStatus} from '@/lib/financial-read-status';
import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/email-auth';
import {customerFinanceEnabled,customerWithdrawalsEnabled} from '@/lib/customer-financial-http';
import {financialReadDatabase} from '@/lib/financial-database';
import {securityFailure,securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const data=await readOwnerFinancialStatus({authenticate:()=>currentUser(request),database:financialReadDatabase,enabled:customerFinanceEnabled,withdrawals:customerWithdrawalsEnabled,deposits:()=>process.env.SIRO_CUSTOMER_DEPOSITS_ENABLED==='true'&&process.env.SIRO_DEPOSIT_DISCOVERY_ENABLED==='true'&&process.env.SIRO_DEPOSIT_VALUATION_ENABLED==='true'&&process.env.SIRO_PRICING_PROVIDER==='coinbase-spot-v1'});
  if(!data)return securityFailure('يتطلب تسجيل الدخول.',401);
  return NextResponse.json(data,{headers:securityHeaders});
 }catch{return securityFailure('تعذّر تحميل الحالة المالية للحساب.',503)}
}
