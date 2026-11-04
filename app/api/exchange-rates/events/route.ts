import {exchangeFeedEnabled} from '@/lib/exchange-feed-control';
import {watchPublicExchangeSchedule} from '@/lib/exchange-source-schedule';
import {wakePublicExchange} from '@/lib/exchange-public-wake';
import {GET as snapshot} from '../route';
import {currentUser,sessionTokenHash} from '@/lib/email-auth';
import {database} from '@/lib/database';
import {accountNotificationEvents} from '@/lib/account-notification-events';
import {financialEventResponse} from '@/lib/financial-event-response';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
export function GET(request:Request){
 if(!exchangeFeedEnabled)return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
 return financialEventResponse(request,{
  authenticate:()=>currentUser(request),enabled:()=>true,
  expiresAt:async userId=>{const {rows:[row]}=await database().query('SELECT "expiresAt" FROM "AuthSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">clock_timestamp()',[sessionTokenHash(request),userId]);return row?new Date(row.expiresAt):null},
  subscribe:async(userId,changed,lost)=>{
   const hub=accountNotificationEvents(),off=await hub.subscribe(userId,changed,lost);
   try{const feedOff=await hub.subscribe('exchange-feed',changed,lost);
    // Only this public-price stream checks its shared source schedule. Wallet
    // notifications/balances retain change-only SSE; no client polling.
    const stop=watchPublicExchangeSchedule(wakePublicExchange);
    return()=>{stop();off();feedOff()}
   }catch(e){off();throw e}
  },snapshot:()=>snapshot(request),
 });
}
