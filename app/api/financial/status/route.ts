import {depositOnlyMode} from '@/lib/deposit-only-mode';
import {depositScannerHealthy} from '@/lib/deposit-scanner-health';
import {readOwnerFinancialStatus} from '@/lib/financial-read-status';
import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/email-auth';
import {customerFinanceEnabled,customerTransfersEnabled,customerWithdrawalsEnabled,customerDepositsEnabled} from '@/lib/customer-financial-http';
import {financialReadDatabase} from '@/lib/financial-database';
import {securityFailure,securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const data=await readOwnerFinancialStatus({authenticate:()=>currentUser(request),database:financialReadDatabase,enabled:()=>customerFinanceEnabled()||customerTransfersEnabled()||customerDepositsEnabled(),transfers:customerTransfersEnabled,withdrawals:customerWithdrawalsEnabled,deposits:async()=>customerDepositsEnabled()&&(!depositOnlyMode()||await depositScannerHealthy(financialReadDatabase()))});
  if(!data)return securityFailure('يتطلب تسجيل الدخول.',401);
  return NextResponse.json(data,{headers:securityHeaders});
 }catch{return securityFailure('تعذّر تحميل الحالة المالية للحساب.',503)}
}
