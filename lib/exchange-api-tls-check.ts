import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
type DB=Pick<PoolClient,'query'>;
const results=new Set(['NETWORK_ERROR','CHALLENGED','HTTP_OR_FORMAT_REJECTED','BODY_LIMIT','INVALID_JSON','API_JSON_SUCCESS','API_JSON_REJECTED','KEY_UNAVAILABLE','CLIENT_SETUP_UNAVAILABLE','CLIENT_RESULT_INVALID']);
const codes=new Set('OK UNRECOGNIZED_RESPONSE MISSING_API_KEY INVALID_API_KEY INVALID_KEY API_KEY_DISABLED API_KEY_INACTIVE API_KEY_EXPIRED KEY_INACTIVE KEY_EXPIRED KEY_DISABLED DOMAIN_NOT_ALLOWED ORIGIN_NOT_ALLOWED IP_NOT_ALLOWED FORBIDDEN UNAUTHORIZED ACCESS_DENIED ENDPOINT_NOT_ALLOWED PLAN_REQUIRED SUBSCRIPTION_REQUIRED RATE_LIMIT_EXCEEDED MONTHLY_LIMIT_EXCEEDED QUOTA_EXCEEDED'.split(' '));
/** Independently sanitize child stdout; a malicious echo/error must not persist a key. */
export function safeTlsApiResult(raw:unknown){
 const r=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
 return {result:typeof r.result==='string'&&results.has(r.result)?r.result:'CLIENT_RESULT_INVALID',
  observedAt:typeof r.at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}(Z|[+]00:00)$/.test(r.at)&&Number.isFinite(Date.parse(r.at))?new Date(r.at).toISOString():null,
  client:'curl_cffi',profile:'chrome',status:Number.isInteger(r.status)&&Number(r.status)>=100&&Number(r.status)<=599?Number(r.status):null,
  format:['json','html','other','none'].includes(String(r.format))?String(r.format):'none',
  challenge:r.challenge===true,quota:r.quota===true,apiOk:r.apiOk===true&&r.result==='API_JSON_SUCCESS'&&r.status===200&&r.format==='json'&&r.challenge!==true,
  providerCode:typeof r.providerCode==='string'&&codes.has(r.providerCode)?r.providerCode:'UNRECOGNIZED_RESPONSE',
  rayId:typeof r.rayId==='string'&&/^[a-f0-9]{16,32}-[A-Z]{3}$/.test(r.rayId)?r.rayId:null};
}
/** User-authorized single November request, separate from paused recurring collector.
 * Reserve before setup/I/O; crash, setup failure or unknown result NEVER re-arms it. */
export async function checkExchangeApiTlsOnce(deps:{db:DB;key?:string;run:(key:string)=>Promise<unknown>;now:()=>Date}){
 const key=deps.key?.trim();if(!key)return;
 const id=randomUUID();
 const claim=await deps.db.query(`UPDATE "ExchangeReference" SET attempts=attempts+1,"requestId"=$1,"lastOutcome"='API_TLS_RUNNING',"lastIssues"='{"experiment":"api-tls-20261103","complete":false}'::jsonb
 WHERE id='sp-today' AND attempts=6 AND attempts<93 AND snapshot IS NULL
 AND month=DATE '2026-11-01' AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date
 AND "blockedUntil"='infinity'::timestamptz AND "lastOutcome"='METHOD_CHECKS_COMPLETE'
 AND "lastHttpStatus"=403 AND "lastIssues"->>'experiment'='methods-20261103'
 AND "lastIssues"->>'complete'='true' RETURNING id`,[id]);
 if(!claim.rows.length)return;
 const at=deps.now().toISOString();
 let raw:unknown;
 try{raw=await deps.run(key)}catch{raw={result:'CLIENT_RESULT_INVALID'}}
 const check=safeTlsApiResult(raw);
 await deps.db.query(`UPDATE "ExchangeReference" SET "lastOutcome"='API_TLS_COMPLETE',"lastHttpStatus"=$2,"lastIssues"=$3::jsonb WHERE id='sp-today' AND "requestId"=$1`,
 [id,check.status,JSON.stringify({experiment:'api-tls-20261103',complete:true,at,check})]);
}
