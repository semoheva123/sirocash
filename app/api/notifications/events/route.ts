import {GET as snapshot} from '../route';
import {currentUser,sessionTokenHash} from '@/lib/email-auth';
import {database} from '@/lib/database';
import {supportAdmin} from '@/lib/support-center';
import {accountNotificationEvents} from '@/lib/account-notification-events';
import {financialEventResponse} from '@/lib/financial-event-response';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
export function GET(request:Request){
 return financialEventResponse(request,{
  authenticate:()=>currentUser(request),enabled:()=>true,
  expiresAt:async userId=>{const {rows:[row]}=await database().query('SELECT "expiresAt" FROM "AuthSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">clock_timestamp()',[sessionTokenHash(request),userId]);return row?new Date(row.expiresAt):null},
  subscribe:async(userId,changed,lost)=>{
   const hub=accountNotificationEvents(),off=await hub.subscribe(userId,changed,lost);
   try{const staffOff=supportAdmin(userId)?await hub.subscribe('support-staff',changed,lost):()=>{};return()=>{off();staffOff()}}catch(e){off();throw e}
  },snapshot:()=>snapshot(request),
 });
}
