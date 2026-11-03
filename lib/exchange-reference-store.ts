import 'server-only';
import {z} from 'zod';
import {exchangeProviderHeaders,exchangeProviderFailure} from './exchange-provider-http';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {exchangeSnapshotSchema,parseExchangeOverview,type ExchangeSnapshot} from './exchange-reference';

type DB=Pick<PoolClient,'query'>;
/** Atomic claim persists BEFORE I/O. Failed/time-out/abandoned attempts still count.
 * Cross-instance/redeploy protection: >=8h apart, <=93/month UTC, no automatic retries.
 * In-flight leases never need recycling before the next scheduled attempt. */
export async function claimExchangeAttempt(db:DB,requestId=randomUUID(),diagnostic:boolean|'repair-access'=false):Promise<string|null>{
 await db.query(`INSERT INTO "ExchangeReference"(id) VALUES('sp-today') ON CONFLICT DO NOTHING`);
 const {rows}=await db.query(`UPDATE "ExchangeReference" SET
  month=date_trunc('month',now() AT TIME ZONE 'UTC')::date,
  attempts=CASE WHEN month=date_trunc('month',now() AT TIME ZONE 'UTC')::date THEN attempts+1 ELSE 1 END,
  "nextAttemptAt"=now()+interval '8 hours',"requestId"=$1
  WHERE id='sp-today' AND (CASE WHEN $2::text='repair-access' THEN snapshot IS NULL AND attempts=2 AND "lastHttpStatus"=403 AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date WHEN $2::text='bootstrap' THEN snapshot IS NULL AND attempts=1 AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date ELSE "nextAttemptAt"<=now() END) AND "blockedUntil"<=now()
  AND (month<>date_trunc('month',now() AT TIME ZONE 'UTC')::date OR attempts<93)
  RETURNING id`,[requestId,diagnostic==='repair-access'?'repair-access':diagnostic?'bootstrap':'scheduled']);
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
export async function loadExchangeReference(deps:{db:DB;key?:string;fetch:typeof fetch;now:()=>Date;diagnostic?:boolean|'repair-access';siteOrigin?:string}):Promise<ExchangeSnapshot|null>{
 // Never expose provider diagnostics, key, headers, or raw response to consumers.
 let previous:ExchangeSnapshot|null=null;
 try{
  previous=await readSnapshot(deps.db);
  if(!deps.key)return previous;
  const requestId=await claimExchangeAttempt(deps.db,randomUUID(),deps.diagnostic);
  if(!requestId)return previous;
  let httpStatus:number|null=null;
  let shape:Record<string,string>|null=null;
  const outcome=async(kind:string,issues:unknown=null)=>{await deps.db.query(`UPDATE "ExchangeReference" SET "lastOutcome"=$2,"lastHttpStatus"=$3,"lastIssues"=$4::jsonb WHERE id='sp-today' AND "requestId"=$1`,[requestId,kind,httpStatus,JSON.stringify(issues)])};
  try{
   const response=await deps.fetch('https://api-v2.sp-today.com/api/v1/overview?lang=en',{
    headers:exchangeProviderHeaders(deps.key,deps.siteOrigin),cache:'no-store',
    redirect:'error',signal:AbortSignal.timeout(8000),
   });
   httpStatus=response.status;
   await blockExhaustedExchange(deps.db,requestId,response,deps.now());
   if(!response.ok){
    let details={providerCode:'UNRECOGNIZED_RESPONSE'};
    try{details=exchangeProviderFailure(await boundedJson(response))}catch{/* No raw body or message is retained. */}
    await outcome(response.status===401||response.status===403?'AUTH_OR_ACCESS':response.status===429?'QUOTA':'HTTP',{...details,responseFormat:response.headers.get('content-type')?.includes('application/json')?'json':response.headers.get('content-type')?.includes('text/html')?'html':'other',challenge:response.headers.get('cf-mitigated')==='challenge'});
    return previous;
   }
   const raw=await boundedJson(response);
   const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
   const type=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':typeof v;
   const data=object(object(raw).data),rates=Array.isArray(data.rates)?data.rates:[];
   const usd=object(rates.find((v:unknown)=>object(v).code==='USD')),city=object(object(usd.cities).damascus);
   const fx=Array.isArray(data.global_fx)?object(data.global_fx[0]):{};
   shape={rates:type(data.rates),global_fx:type(data.global_fx),updated_at:type(data.updated_at),usd_updated_at:type(usd.updated_at),cities:type(usd.cities),buy:type(city.buy),sell:type(city.sell),fx_rate:type(fx.rate)};
   const snapshot=parseExchangeOverview(raw,deps.now());
   // A delayed provider response must never roll source time backwards.
   if(previous&&(Date.parse(snapshot.market.updatedAt)<Date.parse(previous.market.updatedAt)||snapshot.fx.some(quote=>{const older=previous!.fx.find(row=>row.pair===quote.pair);return older&&Date.parse(quote.updatedAt)<Date.parse(older.updatedAt)})))return previous;
   const {rows}=await deps.db.query(`UPDATE "ExchangeReference" SET snapshot=$2::jsonb WHERE id='sp-today' AND "requestId"=$1 RETURNING id`,[requestId,JSON.stringify(snapshot)]);
   await outcome('OK');
   return rows.length?snapshot:previous;
  }catch(error){
   // Schema paths use only our known field names; never log messages/body/key/URLs.
   const allowed=new Set(['data','rates','global_fx','cities','damascus','buy','sell','updated_at','rate','pair','code','ok']);
   const issues=error instanceof z.ZodError?error.issues.slice(0,10).map(i=>({code:i.code,path:i.path.map(p=>typeof p==='number'?p:allowed.has(String(p))?p:'field')})):null;
   await outcome(error instanceof z.ZodError?'SCHEMA':httpStatus===null?'NETWORK_OR_TIMEOUT':'INVALID_RESPONSE',{issues,shape}).catch(()=>{});
   return previous;
  }
 }catch{return previous}
}
