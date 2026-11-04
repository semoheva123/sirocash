import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {database} from '@/lib/database';
import {pushConfigured,deliverWebPush} from '@/lib/web-push';
import {securityHeaders,securityFailure} from '@/lib/security-http';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function POST(request:Request){
 const secret=process.env.WEB_PUSH_WORKER_SECRET,a=Buffer.from(request.headers.get('authorization')??''),b=Buffer.from('Bearer '+(secret??''));
 if(!secret||secret.length<32||a.length!==b.length||!timingSafeEqual(a,b))return securityFailure('Unauthorized.',401);
 if(!pushConfigured())return securityFailure('Push unavailable.',503);
 try{return NextResponse.json(await deliverWebPush(database()),{headers:securityHeaders})}catch{return securityFailure('Push dispatch unavailable.',503)}
}
