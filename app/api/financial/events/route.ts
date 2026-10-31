import {GET as financialStatus} from '../status/route';
import {currentUser,sessionTokenHash} from '@/lib/email-auth';
import {database} from '@/lib/database';
import {customerFinanceEnabled} from '@/lib/customer-financial-http';
import {financialEvents} from '@/lib/financial-events';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
import {financialEventResponse} from '@/lib/financial-event-response';
export function GET(request:Request){
 return financialEventResponse(request,{
  authenticate:()=>currentUser(request),enabled:customerFinanceEnabled,
  expiresAt:async userId=>{const {rows:[session]}=await database().query('SELECT "expiresAt" FROM "AuthSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">clock_timestamp()',[sessionTokenHash(request),userId]);return session?new Date(session.expiresAt):null},
  subscribe:(ownerId,changed,lost)=>financialEvents().subscribe(ownerId,changed,lost),snapshot:()=>financialStatus(request),
 });
}
