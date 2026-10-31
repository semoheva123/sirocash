import 'server-only';
import {NextResponse} from 'next/server';
import {sameOrigin} from './api';
import {readJson} from './request-body';
import {requireUser,sessionTokenHash} from './email-auth';
import {financialDatabase} from './financial-database';
import {customerFinancialCommands} from './customer-financial-commands';
import {securityFailure,securityHeaders} from './security-http';
export function customerFinanceEnabled(){return process.env.VERCEL_ENV==='production'&&process.env.SIRO_CUSTOMER_FINANCE_ENABLED==='true'&&process.env.SIRO_DURABLE_PASSKEY_ENABLED==='true'&&process.env.SIRO_OUTBOX_WORKER_ENABLED==='true'}
export function customerWithdrawalsEnabled(){return customerFinanceEnabled()&&process.env.SIRO_WITHDRAWALS_ENABLED==='true'}
/** No session/owner/rate/account/fee is accepted from request JSON. No demo PIN/debit path. */
export async function customerFinancialHttp(request:Request,action:'PREPARE'|'TRANSFER'|'WITHDRAWAL'){
 try{
  sameOrigin(request);
  if(!customerFinanceEnabled())return securityFailure('الخدمات المالية غير مفعّلة. لم تُنفّذ أي عملية.',503);
  const user=await requireUser(request),sessionHash=sessionTokenHash(request),origin=process.env.WEBAUTHN_ORIGIN;
  if(!sessionHash||!origin)throw Error('FINANCIAL_SESSION_REQUIRED');
  const context={userId:user.id,sessionHash,origin,rpID:new URL(origin).hostname};
  const commands=customerFinancialCommands(financialDatabase(),{settlementAccountId:process.env.SIRO_SETTLEMENT_ACCOUNT_ID??'',feeAccountId:process.env.SIRO_FEE_ACCOUNT_ID??''});
  const input=await readJson(request,8192);
  if((action==='WITHDRAWAL'||action==='PREPARE'&&input&&typeof input==='object'&&'kind' in input&&input.kind==='WITHDRAWAL')&&!customerWithdrawalsEnabled())return securityFailure('السحب غير متاح قبل اكتمال السيولة واختبار القبول. لم يُحجز أي مبلغ.',503);
  if(action==='PREPARE'&&input&&typeof input==='object'&&'kind' in input&&input.kind==='WITHDRAWAL'&&process.env.SIRO_PRICING_PROVIDER!=='coinbase-spot-v1')throw Error('PRICING_SOURCE_NOT_APPROVED');
  const token=request.headers.get('x-siro-approval')??'';
  const result=action==='PREPARE'?await commands.prepare(context,input):action==='TRANSFER'?await commands.transfer(context,input,token):await commands.withdraw(context,input,token);
  return NextResponse.json(result,{headers:securityHeaders});
 }catch{return securityFailure('تعذّر اعتماد الطلب المالي. راجع البيانات والتفويض وصلاحية العرض؛ لم يُؤكَّد تنفيذ الطلب.',400)}
}
