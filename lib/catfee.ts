import 'server-only';
import {createHmac} from 'node:crypto';
import {z} from 'zod';
import {chainJsonPost} from './chain-http';
export function catFeeCredentials(env:Record<string,string|undefined>=process.env){
 const key=env.CATFEE_API_KEY,secret=env.CATFEE_API_SECRET;
 if(!key||!secret||[key,secret].some(v=>v.length>4096||v.trim()!==v||/[\r\n]/.test(v)))throw Error('CATFEE_CONFIGURATION');
 return {key,secret};
}
export const catFeeSun=z.union([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),z.string().regex(/^(0|[1-9]\d{0,18})$/)]).transform(v=>BigInt(v)).refine(v=>v<=9223372036854775807n);
/** Fixed-origin GET-only API. Reuse the bounded streaming/deadline transport, but construct
 * the actual CatFee GET and HMAC over EXACT timestamp + method + encoded path/query.
 * No POST/purchase, arbitrary URL, provider-controlled redirect or retry capability here.
 */
export function catFeeReadClient(credentials:ReturnType<typeof catFeeCredentials>,fetcher:typeof fetch=fetch){
 const {key,secret}=catFeeCredentials({CATFEE_API_KEY:credentials.key,CATFEE_API_SECRET:credentials.secret});
 const read=chainJsonPost({endpoint:'https://api.catfee.io',maxResponseBytes:65536,fetch:async(url,init)=>{
  const target=new URL(String(url)),params=JSON.parse(String(init?.body)) as Record<string,string>;
  target.search=new URLSearchParams(params).toString();
  const timestamp=new Date().toISOString(),path=target.pathname+target.search;
  const headers=new Headers({'Content-Type':'application/json',Accept:'application/json','CF-ACCESS-KEY':key,'CF-ACCESS-TIMESTAMP':timestamp,'CF-ACCESS-SIGN':createHmac('sha256',secret).update(timestamp+'GET'+path).digest('base64')});
  return fetcher(target,{...init,method:'GET',body:undefined,headers});
 }});
 async function call(path:'/v1/account'|'/v1/estimate'|'/v1/order',params:Record<string,string>,signal?:AbortSignal){
  try{const r=z.object({code:z.number().int(),data:z.unknown()}).parse(await read(path,JSON.stringify(params),signal));if(r.code!==0)throw Error();return r.data}catch{throw Error('CATFEE_READ_UNVERIFIED')}
 }
 return {
  async balance(signal?:AbortSignal){const r=z.object({balance:catFeeSun}).parse(await call('/v1/account',{},signal));return {balanceSun:r.balance}},
  async estimate(energyAmount:number,signal?:AbortSignal){
   if(!Number.isSafeInteger(energyAmount)||energyAmount<65000||energyAmount>10000000)throw Error('CATFEE_QUANTITY');
   const cost=catFeeSun.parse(await call('/v1/estimate',{quantity:String(energyAmount),duration:'1h'},signal));if(cost<=0n)throw Error('CATFEE_QUOTE_UNVERIFIED');return cost;
  },
  orderByClientId:(id:string,signal:AbortSignal)=>{if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('CATFEE_ORDER_ID');return call('/v1/order',{client_order_id:id},signal)},
 };
}
