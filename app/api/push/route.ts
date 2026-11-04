import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {currentUser,sessionTokenHash} from '@/lib/email-auth';
import {database,databaseTransaction} from '@/lib/database';
import {sameOrigin} from '@/lib/api';
import {readJson} from '@/lib/request-body';
import {securityHeaders,securityFailure} from '@/lib/security-http';
import {pushConfigured,savePushSubscription} from '@/lib/web-push';
import {pushSubscriptionInput} from '@/lib/web-push-input';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await currentUser(request);if(!user)return securityFailure('Sign in required.',401);const {rows}=await database().query(`SELECT endpoint FROM "WebPushSubscription" WHERE "ownerId"=$1 AND "sessionHash"=$2`,[user.id,sessionTokenHash(request)]);return NextResponse.json({subscriptions:rows.map(r=>createHash('sha256').update(r.endpoint).digest('hex')),enabled:pushConfigured(),publicKey:pushConfigured()?process.env.WEB_PUSH_PUBLIC_KEY:null},{headers:securityHeaders})}catch{return securityFailure('Push unavailable.',503)}}
export async function POST(request:Request){try{sameOrigin(request);const user=await currentUser(request),session=sessionTokenHash(request);if(!user||!session)return securityFailure('Sign in required.',401);if(!pushConfigured())return securityFailure('Push unavailable.',503);const input=pushSubscriptionInput.parse(await readJson(request,4096));await databaseTransaction(tx=>savePushSubscription(tx,user.id,session,input));return NextResponse.json({ok:true},{headers:securityHeaders})}catch{return securityFailure('Could not register this device. Check your session and device limit (5).',400)}}
export async function DELETE(request:Request){try{sameOrigin(request);const user=await currentUser(request);if(!user)return securityFailure('Sign in required.',401);const {endpoint}=z.object({endpoint:z.string().max(2048)}).strict().parse(await readJson(request,4096));await database().query(`DELETE FROM "WebPushSubscription" WHERE "ownerId"=$1 AND endpoint=$2`,[user.id,endpoint]);return NextResponse.json({ok:true},{headers:securityHeaders})}catch{return securityFailure('Could not disable notifications.',400)}}
