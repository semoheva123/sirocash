import {exchangeFeedEnabled} from '@/lib/exchange-feed-control';
import {wakePublicExchange} from '@/lib/exchange-public-wake';
import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/email-auth';
import {database} from '@/lib/database';
import {readExchangeSnapshot} from '@/lib/exchange-reference-store';
import {securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!exchangeFeedEnabled)return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
 try{
  const user=await currentUser(request);
  if(!user)return NextResponse.json({error:'SIGN_IN_REQUIRED'},{status:401,headers:securityHeaders});
  const snapshot=await readExchangeSnapshot(database());
  await wakePublicExchange();
  return NextResponse.json({enabled:true,userId:user.id,snapshot},{headers:securityHeaders});
 }catch{return NextResponse.json({snapshot:null},{status:503,headers:securityHeaders})}
}
