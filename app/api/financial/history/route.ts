import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/email-auth';
import {financialReadDatabase} from '@/lib/financial-database';
import {historyRequest,readFinancialHistoryPage} from '@/lib/financial-history-page';
import {securityFailure,securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const user=await currentUser(request);if(!user)return securityFailure('يتطلب تسجيل الدخول.',401);
  const url=new URL(request.url);if(url.search.length>1024)return securityFailure('طلب غير صالح.',400);
  const raw:Record<string,unknown>=Object.fromEntries(url.searchParams);if(raw.before){try{raw.before=JSON.parse(String(raw.before))}catch{return securityFailure('مؤشر غير صالح.',400)}}
  const parsed=historyRequest.safeParse(raw);if(!parsed.success)return securityFailure('طلب غير صالح.',400);
  const result=await financialReadDatabase().transaction(tx=>readFinancialHistoryPage(tx,user.id,parsed.data));
  return NextResponse.json(result,{headers:securityHeaders});
 }catch{return securityFailure('تعذّر تحميل السجل.',503)}
}
