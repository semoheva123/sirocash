import {NextResponse} from 'next/server';
import {store} from '@/lib/demo-store';
import {currentUser} from '@/lib/email-auth';
import {database} from '@/lib/database';
import {accountOverview} from '@/lib/account-overview';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'};
 try{
  const user=await currentUser(request);
  if(user)return NextResponse.json(await accountOverview(user,(sql,values)=>database().query(sql,values)),{headers});
  return NextResponse.json({user:null,transactions:store.transactions,balance:store.balanceCents/100,demo:true,financialServicesEnabled:false},{headers});
 }catch{
  // An account/database failure must never fall back to somebody else's demo wallet.
  return NextResponse.json({error:'تعذّر تحميل بيانات الحساب. يُرجى إعادة المحاولة.',user:null,transactions:[],balance:null,demo:false},{status:503,headers});
 }
}
