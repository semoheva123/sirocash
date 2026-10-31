import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {tronUsdtContract} from './tron-deposit-verification';
import {validTronAddress} from './tron-addresses';
import {chainJsonPost} from './chain-http';
import {tronZapCredentials} from './tronzap';
const decimal=z.union([z.string(),z.number().finite().nonnegative()]).transform(String).refine(v=>/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(v));
const sun=(v:string)=>{const [whole,fraction='']=v.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type TronZapOrder={requestKey:string;sender:string;energyAmount:number;bandwidthAmount?:number;durationMinutes:60;maxCostSun:bigint;signal:AbortSignal};
const transaction=z.object({id:z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),external_id:z.string(),service:z.enum(['energy','resource_bundle']),params:z.object({address:z.string(),duration:z.literal(1),amounts:z.object({energy:z.number().int().positive(),bandwidth:z.number().int().optional()})}),status:z.enum(['new','pending','success','failed']),amount:decimal,hash:z.string().regex(/^(?:[a-f0-9]{64})?$/)});
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
 async function call(path:'/v1/services'|'/v1/estimate-energy'|'/v1/calculate'|'/v1/transaction/new'|'/v1/transaction/check',body:Record<string,unknown>,signal:AbortSignal){
  const raw=z.object({code:z.number().int(),result:z.unknown().optional()}).parse(await post(path,JSON.stringify(body),signal));
  if(raw.code!==0)throw new Error('PROVIDER_RESULT_UNKNOWN');return raw.result;
 }
 function validate(o:TronZapOrder){if(!Number.isSafeInteger(o.bandwidthAmount??0)||(o.bandwidthAmount??0)<0||(o.bandwidthAmount??0)>10000000||!uuid.test(o.requestKey)||!validTronAddress(o.sender)||!Number.isSafeInteger(o.energyAmount)||o.energyAmount<50000||o.energyAmount>10000000||o.durationMinutes!==60||typeof o.maxCostSun!=='bigint'||o.maxCostSun<=0n||o.maxCostSun>9223372036854775807n||o.signal.aborted)throw new Error('PROVIDER_ORDER_INPUT')}
 function receipt(raw:unknown,o:TronZapOrder){
  const r=transaction.parse(raw);
  if(r.external_id!==o.requestKey||r.params.address!==o.sender||r.params.amounts.energy!==o.energyAmount||(r.params.amounts.bandwidth??0)!==(o.bandwidthAmount??0)||r.service!==((o.bandwidthAmount??0)>0?'resource_bundle':'energy'))throw new Error('PROVIDER_ORDER_BINDING');
  const actualCostSun=sun(r.amount);
  return {orderId:r.id,status:r.status,actualCostSun,priceExceeded:actualCostSun>o.maxCostSun,delegationTxId:r.hash||undefined};
 }
 async function bandwidthRates(signal:AbortSignal){
  return z.object({bandwidth:z.array(z.object({duration:z.number().int(),min_amount:z.number().int().positive(),max_amount:z.number().int().positive(),price:decimal})).max(100)}).parse(await call('/v1/services',{},signal)).bandwidth;
 }
 async function quote(o:TronZapOrder){
  validate(o);const expiresAt=Date.now()+25000;
  try{
   const q=z.object({address:z.string(),type:z.literal('energy'),amount:z.number().int(),duration:z.literal(1),price:decimal,activation_fee:decimal,total:decimal}).parse(await call('/v1/calculate',{address:o.sender,amount:o.energyAmount,duration:1},o.signal));
   if(q.address!==o.sender||q.amount!==o.energyAmount||sun(q.price)+sun(q.activation_fee)!==sun(q.total)||sun(q.total)<=0n||sun(q.total)>o.maxCostSun||Date.now()>=expiresAt)throw new Error();
   let costSun=sun(q.total);
   if((o.bandwidthAmount??0)>0){const tiers=(await bandwidthRates(o.signal)).filter(t=>t.duration===1&&t.min_amount<=o.bandwidthAmount!&&t.max_amount>=o.bandwidthAmount!);if(tiers.length!==1)throw new Error();costSun+=(sun(tiers[0].price)*BigInt(o.bandwidthAmount!)+999n)/1000n}
   if(costSun>o.maxCostSun)throw new Error();
   return {costSun,activateAddress:sun(q.activation_fee)>0n,expiresAt};
  }catch{throw new Error('PROVIDER_QUOTE_UNVERIFIED')}
 }
 return {
  quote,
  async bandwidthPackage(required:number,signal:AbortSignal){
   if(!Number.isSafeInteger(required)||required<=0||required>10000000||signal.aborted)throw new Error('PROVIDER_BANDWIDTH_INPUT');
   const tiers=(await bandwidthRates(signal)).filter(t=>t.duration===1&&t.max_amount>=Math.max(required,t.min_amount)&&t.min_amount<=10000000);
   if(!tiers.length)throw new Error('PROVIDER_BANDWIDTH_UNAVAILABLE');
   const choices=tiers.map(t=>({amount:Math.max(required,t.min_amount),cost:(sun(t.price)*BigInt(Math.max(required,t.min_amount))+999n)/1000n})).filter(t=>t.amount<=10000000&&t.cost>0n);
   choices.sort((a,b)=>a.cost<b.cost?-1:a.cost>b.cost?1:a.amount-b.amount);if(!choices.length)throw new Error('PROVIDER_BANDWIDTH_UNAVAILABLE');return choices[0].amount;
  },
  async estimateEnergy(sender:string,recipient:string,signal:AbortSignal){
   if(!validTronAddress(sender)||!validTronAddress(recipient)||signal.aborted)throw new Error('PROVIDER_ESTIMATE_INPUT');
   try{const e=z.object({amount:z.number().int().min(1).max(10000000),from_address:z.literal(sender),to_address:z.literal(recipient),contract_address:z.literal(tronUsdtContract)}).parse(await call('/v1/estimate-energy',{from_address:sender,to_address:recipient,contract_address:tronUsdtContract},signal));return e.amount}catch{throw new Error('PROVIDER_ESTIMATE_UNVERIFIED')}
  },
  async send(o:TronZapOrder){
   if(options.purchaseEnabled!==true||options.acceptVariableProviderPrice!==true)throw new Error('PROVIDER_PURCHASE_NOT_AUTHORIZED');
   validate(o);
   try{
    // Reprice BEFORE the only paid request. This is not an atomic price lock.
    const q=await quote(o);
    const r=receipt(await call('/v1/transaction/new',{service:(o.bandwidthAmount??0)>0?'resource_bundle':'energy',params:{address:o.sender,amounts:{energy:o.energyAmount,...((o.bandwidthAmount??0)>0?{bandwidth:o.bandwidthAmount}:{})},duration:1,...(q.activateAddress?{activate_address:true}:{})},external_id:o.requestKey},o.signal),o);
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
