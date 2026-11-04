import 'server-only';
import webpush from 'web-push';
import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {pushEndpoint} from './web-push-input';
export function pushConfigured(){return process.env.WEB_PUSH_ENABLED==='true'&&Boolean(process.env.WEB_PUSH_PUBLIC_KEY&&process.env.WEB_PUSH_PRIVATE_KEY&&process.env.WEB_PUSH_WORKER_SECRET)}
/** Claims commit BEFORE network I/O. No retry of uncertain delivery, no financial access. */
export async function deliverWebPush(db:Pick<Pool,'query'>,send:(subscription:webpush.PushSubscription,payload:string)=>Promise<unknown> = (s,p)=>webpush.sendNotification(s,p,{vapidDetails:{subject:'mailto:support@sirocash.online',publicKey:process.env.WEB_PUSH_PUBLIC_KEY!,privateKey:process.env.WEB_PUSH_PRIVATE_KEY!},TTL:300,urgency:'normal',timeout:5000})){
 await db.query(`UPDATE "WebPushDelivery" SET state='FAILED' WHERE (state='CLAIMED' AND "claimedAt"<now()-interval '2 minutes') OR (state='PENDING' AND "createdAt"<now()-interval '24 hours')`);
 const {rows}=await db.query(`WITH candidates AS (SELECT d.id FROM "WebPushDelivery" d WHERE d.state='PENDING' ORDER BY d.id FOR UPDATE SKIP LOCKED LIMIT 50), claimed AS (UPDATE "WebPushDelivery" d SET state='CLAIMED',"claimedAt"=now() FROM candidates c WHERE d.id=c.id RETURNING d.*) SELECT c.id,s.id AS "subscriptionId",s.endpoint,s.p256dh,s.auth,s.language,n.id AS notice FROM claimed c JOIN "WebPushSubscription" s ON s.id=c."subscriptionId" JOIN "AuthSession" a ON a."tokenHash"=s."sessionHash" AND a."userId"=s."ownerId" AND a."expiresAt">now() JOIN "AccountNotification" n ON n.id=c."notificationId" AND n."ownerId"=s."ownerId" AND NOT n.staff`);
 let accepted=0,failed=0;
 for(let start=0;start<rows.length;start+=5)await Promise.all(rows.slice(start,start+5).map(async r=>{
  try{
   const {rows:[current]}=await db.query(`SELECT 1 FROM "WebPushSubscription" s JOIN "AuthSession" a ON a."tokenHash"=s."sessionHash" AND a."userId"=s."ownerId" WHERE s.id=$1 AND a."expiresAt">now()`,[r.subscriptionId]);if(!current)throw Error('Session ended');
   if(!pushEndpoint(r.endpoint))throw Error('Invalid endpoint');
   // Generic lock-screen copy only. No balance, amount, identity, reference or bearer token.
   await send({endpoint:r.endpoint,keys:{p256dh:r.p256dh,auth:r.auth}},JSON.stringify({title:'SiroCash',body:r.language==='ar'?'لديك تحديث جديد في محفظتك. افتح التطبيق للاطلاع عليه.':'You have a new wallet update. Open the app to view it.',url:'/notifications',tag:createHash('sha256').update(r.notice).digest('hex').slice(0,24)}));
   await db.query(`UPDATE "WebPushDelivery" SET state='SENT' WHERE id=$1 AND state='CLAIMED'`,[r.id]);accepted++;
  }catch(e){
   const status=(e as {statusCode?:number})?.statusCode;
   if(status===404||status===410)await db.query(`DELETE FROM "WebPushSubscription" WHERE id=$1`,[r.subscriptionId]);
   else await db.query(`UPDATE "WebPushDelivery" SET state='FAILED' WHERE id=$1 AND state='CLAIMED'`,[r.id]);failed++;
  }
 }));
 await db.query(`DELETE FROM "WebPushSubscription" WHERE id IN (SELECT s.id FROM "WebPushSubscription" s JOIN "AuthSession" a ON a."tokenHash"=s."sessionHash" WHERE a."expiresAt"<=now() LIMIT 100)`);
 // Retain only a bounded diagnostic window, never log subscription keys/endpoints.
 await db.query(`DELETE FROM "WebPushDelivery" WHERE "createdAt"<now()-interval '7 days'`);
 return {processed:rows.length,accepted,failed};
}
export async function savePushSubscription(tx:Pick<PoolClient,'query'>,owner:string,sessionHash:string,input:{endpoint:string;keys:{p256dh:string;auth:string};language:string}){
 await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,['push:'+owner]);
 const {rows:[session]}=await tx.query(`SELECT 1 FROM "AuthSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">now()`,[sessionHash,owner]);if(!session)throw Error('Session expired');
 const {rows:[existing]}=await tx.query(`SELECT "ownerId" FROM "WebPushSubscription" WHERE endpoint=$1`,[input.endpoint]);if(existing&&existing.ownerId!==owner)throw Error('Subscription already bound');
 const {rows:[count]}=await tx.query(`SELECT count(*)::int n FROM "WebPushSubscription" WHERE "ownerId"=$1`,[owner]);if(!existing&&count.n>=5)throw Error('Device limit');
 await tx.query(`INSERT INTO "WebPushSubscription"("ownerId","sessionHash",endpoint,p256dh,auth,language) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(endpoint) DO UPDATE SET "sessionHash"=EXCLUDED."sessionHash",p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,language=EXCLUDED.language WHERE "WebPushSubscription"."ownerId"=EXCLUDED."ownerId"`,[owner,sessionHash,input.endpoint,input.keys.p256dh,input.keys.auth,input.language]);
}
