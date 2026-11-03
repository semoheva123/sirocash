import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/email-auth';
import {database} from '@/lib/database';
import {loadExchangeReference} from '@/lib/exchange-reference-store';
import {securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  if(!await currentUser(request))return NextResponse.json({error:'SIGN_IN_REQUIRED'},{status:401,headers:securityHeaders});
  const snapshot=await loadExchangeReference({db:database(),key:process.env.SP_TODAY_API_KEY,siteOrigin:process.env.WEBAUTHN_ORIGIN,fetch,now:()=>new Date()});
  return NextResponse.json({snapshot},{headers:securityHeaders});
 }catch{return NextResponse.json({snapshot:null},{status:503,headers:securityHeaders})}
}
