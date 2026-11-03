import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {exchangeProviderFailure} from './exchange-provider-http';
import {readExchangeJson} from './exchange-reference-store';
type DB=Pick<PoolClient,'query'>;
type Check={name:'usd-key'|'usd-no-key'|'currencies-minimal';path:string;status:number|null;format:string;challenge:boolean;quota:boolean;rayId:string|null;apiOk:boolean;providerCode:string;at:string};
const root='https://api-v2.sp-today.com/api/v1';
/** Explicit one-time November diagnostic. No proxies, clearance, fake browser
 * identity, redirects, query-string key, fallback retries, or periodic re-arming.
 * Two comparison requests to a documented resource; at most one further request
 * only if authenticated USD is successful and neither comparison is challenged. */
export async function checkExchangeMethodsOnce(deps:{db:DB;key?:string;fetch:typeof fetch;now:()=>Date}){
 const key=deps.key?.trim();if(!key)return;
 const id=randomUUID(),checks:Check[]=[];
 const {rows}=await deps.db.query(`UPDATE "ExchangeReference" SET attempts=attempts+1,"requestId"=$1,"lastOutcome"='METHOD_CHECKS_RUNNING',"lastIssues"='{"experiment":"methods-20261103","checks":[],"complete":false}'::jsonb
  WHERE id='sp-today' AND snapshot IS NULL AND attempts=4 AND attempts<93
  AND month=DATE '2026-11-01' AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date
  AND "lastOutcome"='CURRENCIES_HTTP' AND "lastHttpStatus"=403
  AND "lastIssues"->>'challenge'='true' AND "blockedUntil"='infinity'::timestamptz RETURNING id`,[id]);
 if(!rows.length)return;
 const save=async(complete:boolean)=>deps.db.query(`UPDATE "ExchangeReference" SET "lastOutcome"=$2,"lastHttpStatus"=$3,"lastIssues"=$4::jsonb WHERE id='sp-today' AND "requestId"=$1`,[id,complete?'METHOD_CHECKS_COMPLETE':'METHOD_CHECKS_RUNNING',checks.at(-1)?.status??null,JSON.stringify({experiment:'methods-20261103',checks,complete})]);
 const run=async(name:Check['name'],path:string,authenticated:boolean,first=false)=>{
  if(!first){
   const claim=await deps.db.query(`UPDATE "ExchangeReference" SET attempts=attempts+1 WHERE id='sp-today' AND "requestId"=$1 AND attempts<93 AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date RETURNING id`,[id]);
   if(!claim.rows.length)return false;
  }
  const check:Check={name,path,status:null,format:'none',challenge:false,quota:false,rayId:null,apiOk:false,providerCode:'NETWORK_OR_TIMEOUT',at:deps.now().toISOString()};
  try{
   // Exact documented header style; no Origin, Referer or browser impersonation.
   const headers:Record<string,string>={Accept:'application/json'};
   if(authenticated)headers['X-API-Key']=key;
   const response=await deps.fetch(root+path,{headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
   check.status=response.status;
   const type=response.headers.get('content-type')??'';
   check.format=type.includes('application/json')?'json':type.includes('text/html')?'html':'other';
   check.challenge=response.headers.get('cf-mitigated')==='challenge';
   check.quota=response.status===429||response.headers.get('x-ratelimit-remaining')==='0';
   const ray=response.headers.get('cf-ray');
   check.rayId=ray&&/^[a-f0-9]{16,32}-[A-Z]{3}$/.test(ray)?ray:null;
   check.providerCode='UNRECOGNIZED_RESPONSE';
   try{
    const raw=await readExchangeJson(response);
    check.apiOk=response.ok&&raw!==null&&typeof raw==='object'&&'ok' in raw&&raw.ok===true;
    check.providerCode=check.apiOk?'OK':exchangeProviderFailure(raw).providerCode;
   }catch{/* No raw body, messages, request headers, key or arbitrary server text. */}
  }catch{/* Failed attempts count; no retry. */}
  checks.push(check);await save(false);return true;
 };
 await run('usd-key','/currency/usd?lang=en',true,true);
 if(checks[0].quota){await save(true);return;}
 // Deliberate credential-free control, not a second attempt at the authenticated
 // response or a challenge workaround. Needed to distinguish key vs hosting block.
 if(await run('usd-no-key','/currency/usd?lang=en',false)){
  if(checks[0].apiOk&&!checks.some(check=>check.challenge||check.quota))await run('currencies-minimal','/currencies?lang=en',true);
 }
 await save(true);
}
