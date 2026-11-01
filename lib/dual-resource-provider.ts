import 'server-only';
import {validTronAddress} from './tron-addresses';
import {randomUUID} from 'node:crypto';
import type {WalletDb} from './wallet-engine';
import type {ResourceOrder,ResourceProvider,ResourceReceipt} from './resource-provider';
import type {tronRentalOrderClient} from './tronrental-orders';
import type {createEnergyDeliveryObserver} from './energy-delivery-observer';
/** One combined budget, independent immutable child claims, no automatic POST retries.
 * Unknown bandwidth without an order ID remains held for provider-assisted reconciliation.
 */
export function dualResourceProvider(db:WalletDb,options:{energy:ResourceProvider;bandwidth:ReturnType<typeof tronRentalOrderClient>;observe:ReturnType<typeof createEnergyDeliveryObserver>;enabled:boolean}):ResourceProvider{
 function validate(o:ResourceOrder){if(!/^[a-f0-9-]{36}$/i.test(o.requestKey)||!validTronAddress(o.sender)||typeof o.maxCostSun!=='bigint'||o.maxCostSun<=0n||o.maxCostSun>9223372036854775807n||!Number.isSafeInteger(o.energyAmount)||o.energyAmount<0||(o.energyAmount>0&&o.energyAmount<65000)||!Number.isSafeInteger(o.bandwidthAmount??0)||(o.bandwidthAmount??0)<0||(o.bandwidthAmount??0)>100000||(!o.energyAmount&&!o.bandwidthAmount)||o.durationMinutes!==60||o.signal.aborted)throw Error('RESOURCE_ORDER_INPUT')}
 const energyOrder=(o:ResourceOrder,maxCostSun=o.maxCostSun)=>({...o,bandwidthAmount:0,maxCostSun});
 async function legs(o:ResourceOrder){validate(o);const {rows}=await db.transaction(tx=>tx.query('SELECT * FROM "ResourcePurchaseLeg" WHERE "claimId"=$1 ORDER BY resource',[o.requestKey]));
  if(rows.length!==Number(o.energyAmount>0)+Number((o.bandwidthAmount??0)>0)||rows.reduce((s,r)=>s+BigInt(String(r.quotedSun)),0n)!==o.maxCostSun)throw Error('RESOURCE_PLAN_BINDING');
  for(const r of rows)if(r.sender!==o.sender||r.quantity!==(r.resource==='ENERGY'?o.energyAmount:o.bandwidthAmount)||r.provider!==(r.resource==='ENERGY'?'catfee':'tronrental'))throw Error('RESOURCE_PLAN_BINDING');return rows;
 }
 async function save(o:ResourceOrder,resource:string,r:ResourceReceipt|{orderId:string;status:'pending'|'success'|'failed';actualCostSun:bigint;delegationTxId?:string}){
  await db.transaction(async tx=>{
   // Same first mutex as the parent reservation: a known price breach disables new purchases immediately.
   await tx.query('SELECT id FROM "EnergyPurchasePolicy" WHERE id=1 FOR UPDATE');
   const {rows:[leg]}=await tx.query('UPDATE "ResourcePurchaseLeg" SET state=\'ACKNOWLEDGED\',"orderId"=$3,"actualSun"=$4,status=$5,"txId"=$6 WHERE "claimId"=$1 AND resource=$2 RETURNING "quotedSun"',[o.requestKey,resource,r.orderId,r.actualCostSun.toString(),r.status==='new'?'pending':r.status,r.delegationTxId??null]);
   if(!leg)throw Error('RESOURCE_LEG_MISSING');
   if(r.actualCostSun>BigInt(String(leg.quotedSun)))await tx.query('UPDATE "EnergyPurchasePolicy" SET enabled=false WHERE id=1');
  });
 }
 return {
  purchaseBlocker:()=>!options.enabled?'DUAL_RESOURCE_PURCHASE_DISABLED':options.energy.purchaseBlocker?.(),
  async bandwidthPackage(required,signal){if(signal.aborted||!Number.isSafeInteger(required)||required<1||required>100000)throw Error('BANDWIDTH_AMOUNT');return required},
  async quote(o){validate(o);const e=o.energyAmount?await options.energy.quote(energyOrder(o)):{costSun:0n,expiresAt:Date.now()+25000};const b=o.bandwidthAmount?await options.bandwidth.quote(o.bandwidthAmount,o.signal):{costSun:0n,expiresAt:Date.now()+25000};const costSun=e.costSun+b.costSun;if(costSun>o.maxCostSun)throw Error('RESOURCE_COMBINED_CAP');return {costSun,expiresAt:Math.min(e.expiresAt,b.expiresAt),parts:{energySun:e.costSun,bandwidthSun:b.costSun}}},
  async reserve(tx,o,q){validate(o);if(!q.parts||q.costSun!==o.maxCostSun||q.parts.energySun+q.parts.bandwidthSun!==q.costSun||q.costSun<=0n||q.expiresAt<=Date.now())throw Error('RESOURCE_PLAN_BINDING');
   for(const [resource,provider,quantity,cost] of [['ENERGY','catfee',o.energyAmount,q.parts.energySun],['BANDWIDTH','tronrental',o.bandwidthAmount??0,q.parts.bandwidthSun]] as const){if(!quantity){if(cost!==0n)throw Error('RESOURCE_PLAN_BINDING');continue}if(cost<=0n)throw Error('RESOURCE_PLAN_BINDING');await tx.query('INSERT INTO "ResourcePurchaseLeg" ("claimId",resource,provider,"requestKey",sender,quantity,"quotedSun","expiresAt") VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8 / 1000.0))',[o.requestKey,resource,provider,randomUUID(),o.sender,quantity,cost.toString(),q.expiresAt])}
  },
  async send(o){if(!options.enabled)throw Error('DUAL_RESOURCE_PURCHASE_DISABLED');const rows=await legs(o);
   for(const leg of rows){
    if(o.signal.aborted)throw Error('WORKER_ABORTED');
    const claimed=await db.transaction(async tx=>{const {rows:[policy]}=await tx.query('SELECT enabled FROM "EnergyPurchasePolicy" WHERE id=1 FOR UPDATE');if(policy?.enabled!==true)throw Error('RESOURCE_PURCHASE_POLICY_DISABLED');return tx.query('UPDATE "ResourcePurchaseLeg" SET state=\'UNKNOWN\' WHERE "claimId"=$1 AND resource=$2 AND state=\'READY\' AND "expiresAt">clock_timestamp() RETURNING "requestKey"',[o.requestKey,leg.resource])});
    if(!claimed.rows.length)throw Error('RESOURCE_LEG_ALREADY_CLAIMED_OR_EXPIRED');
    const cost=BigInt(String(leg.quotedSun)),requestKey=String(leg.requestKey);
    if(leg.resource==='ENERGY'){const sent=await options.energy.send(energyOrder({...o,requestKey},cost));await db.transaction(tx=>tx.query('UPDATE "ResourcePurchaseLeg" SET state=\'ACKNOWLEDGED\',"orderId"=$3 WHERE "claimId"=$1 AND resource=$2',[o.requestKey,leg.resource,sent.orderId]));}
    else {const receipt=await options.bandwidth.send({requestKey,sender:o.sender,quantity:Number(leg.quantity),maxCostSun:cost,expiresAt:new Date(String(leg.expiresAt)).getTime(),signal:o.signal});await save(o,String(leg.resource),receipt);if(receipt.status==='failed'||receipt.actualCostSun>cost)throw Error('RESOURCE_LEG_REJECTED_OR_OVER_CAP')}
   }
   return {orderId:'dual:'+o.requestKey};
  },
  async check(o){
   const existing=await db.transaction(tx=>tx.query('SELECT 1 FROM "ResourcePurchaseLeg" WHERE "claimId"=$1',[o.requestKey]));
   if(!existing.rows.length&&!o.bandwidthAmount)return options.energy.check(o);
   const rows=await legs(o);let total=0n,all=true,failed=false,terminal=true;const proofs:{txId:string;resource:'ENERGY'|'BANDWIDTH'}[]=[];
   for(const leg of rows){
    const resource=leg.resource as 'ENERGY'|'BANDWIDTH',requestKey=String(leg.requestKey),maxCostSun=BigInt(String(leg.quotedSun));let r:ResourceReceipt|Awaited<ReturnType<typeof options.bandwidth.check>>|undefined;
    try{
     if(leg.state!=='READY'&&resource==='ENERGY')r=await options.energy.check(energyOrder({...o,requestKey},maxCostSun));
     if(resource==='BANDWIDTH'&&leg.orderId)r=await options.bandwidth.check({requestKey,sender:o.sender,quantity:Number(leg.quantity),maxCostSun,signal:o.signal},String(leg.orderId));
     if(r)await save(o,resource,r);
    }catch{all=false;r=undefined}
    total+=r?.actualCostSun??BigInt(String(leg.actualSun??leg.quotedSun));
    if(!r||r.status!=='success'||!r.delegationTxId)all=false;
    if(!r||!['success','failed'].includes(r.status))terminal=false;
    if(r?.status==='failed')failed=true;
    if(r?.status==='success'&&r.delegationTxId)proofs.push({txId:r.delegationTxId,resource});
   }
   if(all&&!failed){for(const p of proofs)await options.observe({sender:o.sender,energyAmount:o.energyAmount,bandwidthAmount:o.bandwidthAmount,delegationTxId:p.txId,resourceType:p.resource,signal:o.signal})}
   return {orderId:'dual:'+o.requestKey,status:failed&&terminal?'failed':all?'success':'pending',actualCostSun:total,priceExceeded:total>o.maxCostSun,delegationTxId:all&&!failed?proofs[0]?.txId:undefined};
  },
 };
}
