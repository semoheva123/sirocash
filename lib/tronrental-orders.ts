import 'server-only';
import {chainJsonPost} from './chain-http';
import {tronRentalReadClient,tronRentalSun} from './tronrental-read';
import {validTronAddress} from './tron-addresses';
export type BandwidthOrder={requestKey:string;sender:string;quantity:number;maxCostSun:bigint;expiresAt?:number;signal:AbortSignal};
export type BandwidthReceipt={orderId:string;status:'pending'|'success'|'failed';actualCostSun:bigint;delegationTxId?:string};
export function tronRentalOrderClient(options:{key:string;fetch?:typeof fetch;enabled:boolean;assertActive:(sender:string,signal:AbortSignal)=>Promise<void>}){
 const read=tronRentalReadClient(options.key,options.fetch);
 function validate(o:BandwidthOrder){if(!/^[a-f0-9-]{36}$/i.test(o.requestKey)||!validTronAddress(o.sender)||!Number.isSafeInteger(o.quantity)||o.quantity<1||o.quantity>100000||o.maxCostSun<=0n||o.signal.aborted)throw Error('TRONRENTAL_ORDER_INPUT')}
 function receipt(data:any,expected?:string):BandwidthReceipt{
  if(!data||!Number.isSafeInteger(data.id)||data.id<=0||(expected!==undefined&&String(data.id)!==expected)||!['pending','filled','failed','reclaimed'].includes(data.status))throw Error('TRONRENTAL_RECEIPT');
  const actualCostSun=tronRentalSun(data.price_trx)+tronRentalSun(data.activation_cost_trx===null?'0':data.activation_cost_trx);
  const tx=data.txid??data.delegate_txid??undefined;
  if(tx!==undefined&&tx!==null&&!/^[a-f0-9]{64}$/.test(tx))throw Error('TRONRENTAL_RECEIPT');
  return {orderId:String(data.id),status:data.status==='filled'?'success':data.status==='pending'?'pending':'failed',actualCostSun,delegationTxId:tx??undefined};
 }
 async function call(path:string,body:unknown,method:'GET'|'POST',signal:AbortSignal,idempotency?:string){
  if(!((method==='POST'&&path==='/v1/bandwidth/buy')||(method==='GET'&&/^\/v1\/orders\/[1-9][0-9]{0,15}$/.test(path))))throw Error('TRONRENTAL_ROUTE');
  const transport=chainJsonPost({endpoint:'https://api.tronrental.com',maxResponseBytes:65536,fetch:(url,init)=>(options.fetch??fetch)(url,{...init,method,body:method==='POST'?init?.body:undefined,headers:{'Content-Type':'application/json',Accept:'application/json','X-API-Key':options.key,...(idempotency?{'Idempotency-Key':idempotency}:{})}})});
  try{return await transport(path,JSON.stringify(body),signal)}catch{throw Error('TRONRENTAL_ORDER_UNVERIFIED')}
 }
 return {
  quote:read.bandwidthQuote,
  async send(o:BandwidthOrder){
   if(!options.enabled)throw Error('TRONRENTAL_PURCHASE_DISABLED');validate(o);
   // Activation is outside the provider max_price_trx: never rely on an env assertion.
   await options.assertActive(o.sender,o.signal);if(o.expiresAt===undefined||!Number.isSafeInteger(o.expiresAt)||Date.now()>=o.expiresAt)throw Error('TRONRENTAL_QUOTE_EXPIRED');if(o.signal.aborted)throw Error('WORKER_ABORTED');
   const max=(o.maxCostSun/1000000n).toString()+'.'+(o.maxCostSun%1000000n).toString().padStart(6,'0');
   return receipt(await call('/v1/bandwidth/buy',{target_address:o.sender,volume:o.quantity,duration:'1h',max_price_trx:max},'POST',o.signal,o.requestKey));
  },
  async check(o:BandwidthOrder,orderId:string){validate(o);if(!/^[1-9][0-9]{0,15}$/.test(orderId))throw Error('TRONRENTAL_ORDER_ID');
   const data=await call('/v1/orders/'+orderId,{},'GET',o.signal) as Record<string,unknown>;
   if(data.type!=='bandwidth'||data.target_address!==o.sender||data.volume!==o.quantity||data.duration!=='1h')throw Error('TRONRENTAL_ORDER_BINDING');
   return receipt(data,orderId);
  },
 };
}
