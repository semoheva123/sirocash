import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {flushSecurityMail} from '@/lib/security-mail';
import {securityHeaders,securityFailure} from '@/lib/security-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32)return securityFailure('Service unavailable.',503);
 const a=Buffer.from(request.headers.get('authorization')||''),b=Buffer.from('Bearer '+secret);
 if(a.length!==b.length||!timingSafeEqual(a,b))return securityFailure('Unauthorized.',401);
 try{return NextResponse.json(await flushSecurityMail(),{headers:securityHeaders})}catch{return securityFailure('Service unavailable.',503)}
}
