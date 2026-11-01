import 'server-only';
import {z} from 'zod';
import {catFeeReadClient,catFeeSun,type catFeeCredentials} from './catfee';
import {validTronAddress} from './tron-addresses';
import type {ResourceOrder,ResourceProvider} from './resource-provider';
const receipt=z.object({id:z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),client_order_id:z.string(),receiver:z.string(),resource_type:z.literal('ENERGY'),quantity:z.number().int(),duration:z.literal(1),pay_amount_sun:catFeeSun,activate_amount_sun:catFeeSun,status:z.string(),confirm_status:z.string(),delegate_hash:z.string().regex(/^(?:[a-f0-9]{64})?$/)});
function validate(o:ResourceOrder){if(!validTronAddress(o.sender)||!Number.isSafeInteger(o.energyAmount)||o.energyAmount<65000||o.energyAmount>10000000||!Number.isSafeInteger(o.bandwidthAmount??0)||(o.bandwidthAmount??0)<0||o.durationMinutes!==60||typeof o.maxCostSun!=='bigint'||o.maxCostSun<=0n||o.maxCostSun>9223372036854775807n||o.signal.aborted)throw Error('CATFEE_ORDER_INPUT')}
/** CatFee ONLY. No legacy fallback and no signed customer transaction handoff.
 * CatFee's published rental API does not document an atomic max-price field. Provider
 * selection is not consent to variable charges. Keep purchase blocked BEFORE any claim
 * or HTTP request until a reviewed capped energy+bandwidth contract is available.
 */
export function catFeeOrderClient(options:{credentials:ReturnType<typeof catFeeCredentials>;fetch?:typeof fetch}):ResourceProvider{
 const read=catFeeReadClient(options.credentials,options.fetch);
 return {
  purchaseBlocker:()=> 'CATFEE_HARD_PRICE_CAP_UNVERIFIED',
  async quote(o){validate(o);if(o.bandwidthAmount)throw Error('CATFEE_BANDWIDTH_QUOTE_UNVERIFIED');const expiresAt=Date.now()+25000,costSun=await read.estimate(o.energyAmount,o.signal);if(costSun>o.maxCostSun||Date.now()>=expiresAt)throw Error('CATFEE_QUOTE_CAP_OR_EXPIRED');return {costSun,expiresAt}},
  async send(){throw Error('CATFEE_HARD_PRICE_CAP_UNVERIFIED')},
  async bandwidthPackage(){throw Error('CATFEE_BANDWIDTH_EXECUTION_UNVERIFIED')},
  async check(o){
   validate(o);if(o.bandwidthAmount)throw Error('CATFEE_BUNDLE_RECOVERY_UNVERIFIED');
   const r=receipt.parse(await read.orderByClientId(o.requestKey,o.signal));
   if(r.client_order_id!==o.requestKey||r.receiver!==o.sender||r.quantity!==o.energyAmount)throw Error('CATFEE_ORDER_BINDING');
   // Conservative sum until activation-inclusive billing semantics are independently verified.
   const actualCostSun=r.pay_amount_sun+r.activate_amount_sun;
   const failed=!['PAYMENT_SUCCESS','DELEGATE_SUCCESS'].includes(r.status)||!['UNCONFIRMED','DELEGATION_CONFIRMED'].includes(r.confirm_status);
   const status=failed?'failed':r.status==='DELEGATE_SUCCESS'&&r.confirm_status==='DELEGATION_CONFIRMED'?'success':'pending';
   return {orderId:r.id,status,actualCostSun,priceExceeded:actualCostSun>o.maxCostSun,delegationTxId:r.delegate_hash||undefined};
  },
 };
}
