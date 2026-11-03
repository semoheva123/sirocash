import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/email-auth';
import {database} from '@/lib/database';
import {sameOrigin} from '@/lib/api';
import {readJson} from '@/lib/request-body';
import {securityHeaders,securityFailure} from '@/lib/security-http';
import {supportAdmin} from '@/lib/support-center';
import {readAccountNotifications,markAccountNotificationRead} from '@/lib/account-notifications';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{const user=await currentUser(request);if(!user)return securityFailure('Sign in required.',401);return NextResponse.json(await readAccountNotifications(database(),user.id,supportAdmin(user.id)),{headers:securityHeaders})}
 catch{return securityFailure('Notifications unavailable.',503)}
}
export async function POST(request:Request){
 try{sameOrigin(request);const user=await currentUser(request);if(!user)return securityFailure('Sign in required.',401);
 const {id}=z.object({id:z.string().min(1).max(200)}).strict().parse(await readJson(request,1024));
 await markAccountNotificationRead(database(),user.id,supportAdmin(user.id),id);return NextResponse.json({ok:true},{headers:securityHeaders});
 }catch{return securityFailure('Request unavailable.',400)}
}
