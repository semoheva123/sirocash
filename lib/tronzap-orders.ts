import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {validTronAddress} from './tron-addresses';
import {chainJsonPost} from './chain-http';
import {tronZapCredentials} from './tronzap';
const decimal=z.union([z.string(),z.number().finite().nonnegative()]).transform(String).refine(v=>/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(v));
const sun=(v:string)=>{const [whole,fraction='']=v.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type TronZapOrder={requestKey:string;sender:string;energyAmount:number;durationMinutes:60;maxCostSun:bigint;signal:AbortSignal};
const transaction=z.object({id:z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),external_id:z.string(),service:z.literal('energy'),params:z.object({address:z.string(),duration:z.literal(1),amounts:z.object({energy:z.number().int().positive(),bandwidth:z.number().int().optional()})}),status:z.enum(['new','pending','success','failed']),amount:decimal,hash:z.string().regex(/^(?:[a-f0-9]{64})?$/)});
/** Official SDK request contract pinned in docs/financial-worker-progress.md.
 * This API has NO atomic maximum-price field. Construction for purchases therefore
 * requires a SEPARATE explicit operator acceptance of variable provider pricing.
 * Never supply acceptVariableProviderPrice from a customer command. Read recovery
 * does not need purchase permission. No HTTP retry, not-found retry or auto-refund.
 */
export function tronZapOrderClient(options:{credentials:{token:string;secret:string};purchaseEnabled?:boolean;acceptVariableProviderPrice?:boolean;fetch?:typeof fetch}){
 const {token,secret}=tronZapCredentials({TRONZAP_API_TOKEN:options.credentials.token,TRONZAP_API_SECRET:options.credentials.secret});
 const post=chainJsonPost({endpoint:'https://api.tronzap.com',authorization:'Bearer '+token,maxResponseBytes:65536,fetch:async(url,init)=>{
  const headers=new Headers(init?.headers);headers.set('X-Signature',createHash('sha256').update(String(init?.body)+secret,'utf8').digest('hex'));
  return (options.fetch??fetch)(url,{...init,headers});
 }});
 async function call(path:'/v1/calculate'|'/v1/transaction/new'|'/v1/transaction/check',body:Record<string,unknown>,signal:AbortSignal){
  const raw=z.object({code:z.number().int(),result:z.unknown().optional()}).parse(await post(path,JSON.stringify(body),signal));
  if(raw.code!==0)throw new Error('PROVIDER_RESULT_UNKNOWN');return raw.result;
 }
 function validate(o:TronZapOrder){if(!uuid.test(o.requestKey)||!validTronAddress(o.sender)||!Number.isSafeInteger(o.energyAmount)||o.energyAmount<50000||o.energyAmount>10000000||o.durationMinutes!==60||typeof o.maxCostSun!=='bigint'||o.maxCostSun<=0n||o.maxCostSun>9223372036854775807n||o.signal.aborted)throw new Error('PROVIDER_ORDER_INPUT')}
 function receipt(raw:unknown,o:TronZapOrder){
  const r=transaction.parse(raw);
  if(r.external_id!==o.requestKey||r.params.address!==o.sender||r.params.amounts.energy!==o.energyAmount||(r.params.amounts.bandwidth??0)!==0)throw new Error('PROVIDER_ORDER_BINDING');
  const actualCostSun=sun(r.amount);
  return {orderId:r.id,status:r.status,actualCostSun,priceExceeded:actualCostSun>o.maxCostSun,delegationTxId:r.hash||undefined};
 }
 return {
  async send(o:TronZapOrder){
   if(options.purchaseEnabled!==true||options.acceptVariableProviderPrice!==true)throw new Error('PROVIDER_PURCHASE_NOT_AUTHORIZED');
   validate(o);
   try{
    // Reprice BEFORE the only paid request. This is not an atomic price lock.
    const quote=z.object({address:z.string(),type:z.literal('energy'),amount:z.number().int(),duration:z.literal(1),price:decimal,activation_fee:decimal,total:decimal}).parse(await call('/v1/calculate',{address:o.sender,amount:o.energyAmount,duration:1},o.signal));
    if(quote.address!==o.sender||quote.amount!==o.energyAmount||sun(quote.price)+sun(quote.activation_fee)!==sun(quote.total)||sun(quote.total)>o.maxCostSun)throw new Error();
    const r=receipt(await call('/v1/transaction/new',{service:'energy',params:{address:o.sender,amounts:{energy:o.energyAmount},duration:1},external_id:o.requestKey},o.signal),o);
    if(r.priceExceeded)throw new Error();
    return {orderId:r.orderId}; // ACK only. Never signals delivery or settlement.
   }catch{throw new Error('PROVIDER_ORDER_UNCERTAIN')}
  },
  async check(o:TronZapOrder){
   validate(o);
   try{return receipt(await call('/v1/transaction/check',{external_id:o.requestKey},o.signal),o)}
   catch{throw new Error('PROVIDER_LOOKUP_UNVERIFIED')} // Includes not-found; NEVER permits a new create.
  },
 };
}
