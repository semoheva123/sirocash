import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {exchangeSnapshotSchema,parseExchangeOverview,type ExchangeSnapshot} from './exchange-reference';

type DB=Pick<PoolClient,'query'>;
/** Atomic claim persists BEFORE I/O. Failed/time-out/abandoned attempts still count.
 * Cross-instance/redeploy protection: >=8h apart, <=93/month UTC, no automatic retries.
 * In-flight leases never need recycling before the next scheduled attempt. */
export async function claimExchangeAttempt(db:DB,requestId=randomUUID()):Promise<string|null>{
 await db.query(`INSERT INTO "ExchangeReference"(id) VALUES('sp-today') ON CONFLICT DO NOTHING`);
 const {rows}=await db.query(`UPDATE "ExchangeReference" SET
  month=date_trunc('month',now() AT TIME ZONE 'UTC')::date,
  attempts=CASE WHEN month=date_trunc('month',now() AT TIME ZONE 'UTC')::date THEN attempts+1 ELSE 1 END,
  "nextAttemptAt"=now()+interval '8 hours',"requestId"=$1
  WHERE id='sp-today' AND "nextAttemptAt"<=now() AND "blockedUntil"<=now()
  AND (month<>date_trunc('month',now() AT TIME ZONE 'UTC')::date OR attempts<93)
  RETURNING id`,[requestId]);
 return rows.length?requestId:null;
}
async function readSnapshot(db:DB):Promise<ExchangeSnapshot|null>{
 const {rows}=await db.query(`SELECT snapshot FROM "ExchangeReference" WHERE id='sp-today'`);
 const parsed=exchangeSnapshotSchema.safeParse(rows[0]?.snapshot);
 return parsed.success?parsed.data:null;
}
/** Honor exhaustion even if the body is invalid. A missing/malformed reset blocks to
 * next UTC month. Cap provider-controlled reset to 32 days; never trust an arbitrary URL. */
export async function blockExhaustedExchange(db:DB,id:string,response:Response,now:Date){
 if(response.status!==429&&response.headers.get('x-ratelimit-remaining')!=='0')return;
 const next=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1);
 const raw=response.headers.get('x-ratelimit-reset');
 const reset=raw&&/^\d{10}$/.test(raw)?Number(raw)*1000:NaN;
 const until=Number.isFinite(reset)&&reset>now.getTime()&&reset<=now.getTime()+32*86400000?reset:next;
 await db.query(`UPDATE "ExchangeReference" SET "blockedUntil"=$2 WHERE id='sp-today' AND "requestId"=$1`,[id,new Date(until)]);
}
async function boundedJson(response:Response){
 if(!response.body)throw Error('EXCHANGE_UNAVAILABLE');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>256*1024)throw Error('EXCHANGE_UNAVAILABLE');parts.push(value)}}finally{await reader.cancel().catch(()=>{})}
 return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
}
export async function loadExchangeReference(deps:{db:DB;key?:string;fetch:typeof fetch;now:()=>Date}):Promise<ExchangeSnapshot|null>{
 // Never expose provider diagnostics, key, headers, or raw response to consumers.
 let previous:ExchangeSnapshot|null=null;
 try{
  previous=await readSnapshot(deps.db);
  if(!deps.key)return previous;
  const requestId=await claimExchangeAttempt(deps.db);
  if(!requestId)return previous;
  try{
   const response=await deps.fetch('https://api-v2.sp-today.com/api/v1/overview?lang=en',{
    headers:{'X-API-Key':deps.key,Accept:'application/json'},cache:'no-store',
    redirect:'error',signal:AbortSignal.timeout(8000),
   });
   await blockExhaustedExchange(deps.db,requestId,response,deps.now());
   if(!response.ok){await response.body?.cancel();return previous}
   const snapshot=parseExchangeOverview(await boundedJson(response),deps.now());
   // A delayed provider response must never roll source time backwards.
   if(previous&&(Date.parse(snapshot.market.updatedAt)<Date.parse(previous.market.updatedAt)||snapshot.fx.some(quote=>{const older=previous!.fx.find(row=>row.pair===quote.pair);return older&&Date.parse(quote.updatedAt)<Date.parse(older.updatedAt)})))return previous;
   const {rows}=await deps.db.query(`UPDATE "ExchangeReference" SET snapshot=$2::jsonb WHERE id='sp-today' AND "requestId"=$1 RETURNING id`,[requestId,JSON.stringify(snapshot)]);
   return rows.length?snapshot:previous;
  }catch{return previous}
 }catch{return previous}
}
