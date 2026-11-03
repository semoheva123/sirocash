import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {exchangeProviderFailure,exchangeProviderHeaders} from './exchange-provider-http';
import {readExchangeJson} from './exchange-reference-store';
type DB=Pick<PoolClient,'query'>;
/** Explicitly authorized November 2026 experiment, NOT a fallback collector.
 * Exactly one reservation from the observed attempts=3/403/challenge state. The
 * deliberate challenge pause remains intact; no quotas/counters/cooldowns reset.
 * A quota-only block cannot qualify. Future months cannot re-arm this experiment. */
export async function probeExchangeCurrenciesOnce(deps:{db:DB;key?:string;siteOrigin?:string;fetch:typeof fetch}){
 if(!deps.key)return;
 const headers=exchangeProviderHeaders(deps.key,deps.siteOrigin),id=randomUUID();
 const {rows}=await deps.db.query(`UPDATE "ExchangeReference" SET attempts=attempts+1,"requestId"=$1
  WHERE id='sp-today' AND snapshot IS NULL AND attempts=3 AND attempts<93
  AND month=DATE '2026-11-01' AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date
  AND "lastHttpStatus"=403 AND "lastIssues"->>'challenge'='true'
  AND "blockedUntil"='infinity'::timestamptz
  RETURNING id`,[id]);
 if(!rows.length)return;
 let status:number|null=null;
 const save=async(kind:string,details:Record<string,unknown>)=>{
  await deps.db.query(`UPDATE "ExchangeReference" SET "lastOutcome"=$2,"lastHttpStatus"=$3,"lastIssues"=$4::jsonb
   WHERE id='sp-today' AND "requestId"=$1`,[id,kind,status,JSON.stringify({endpoint:'currencies',...details})]);
 };
 try{
  const response=await deps.fetch('https://api-v2.sp-today.com/api/v1/currencies?lang=en',{
   headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000),
  });
  status=response.status;
  const details={responseFormat:response.headers.get('content-type')?.includes('application/json')?'json':response.headers.get('content-type')?.includes('text/html')?'html':'other',challenge:response.headers.get('cf-mitigated')==='challenge'};
  let raw:unknown;
  try{raw=await readExchangeJson(response)}catch{
   await save(response.ok?'CURRENCIES_INVALID_RESPONSE':'CURRENCIES_HTTP',details);return;
  }
  if(!response.ok){await save('CURRENCIES_HTTP',{...details,...exchangeProviderFailure(raw)});return}
  const obj=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const root=obj(raw),currencies=obj(root.data).currencies;
  const valid=root.ok===true&&Array.isArray(currencies)&&currencies.length<=1000;
  await save(valid?'CURRENCIES_JSON_OK':'CURRENCIES_INVALID_RESPONSE',{
   ...details,...(root.ok===true?{}:exchangeProviderFailure(raw)),
   currencyCount:valid?currencies.length:null,
   hasUsd:valid?currencies.some(row=>obj(row).code==='USD'):false,
  });
 }catch{
  await save('CURRENCIES_NETWORK_OR_TIMEOUT',{}).catch(()=>{});
 }
}
