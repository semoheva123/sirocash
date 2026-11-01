/** TRON cannot combine free and delegated/staked Bandwidth to pay one transaction.
 * One bucket must cover its full serialized byte cost; summing can cause TRX burn.
 */
export function tronBandwidth(r:Record<string,unknown>){
 const n=(v:unknown)=>{if(v===undefined)return 0;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw Error('TRON_BANDWIDTH_SCHEMA');return v};
 const delegated=Math.max(0,n(r.NetLimit)-n(r.NetUsed)),free=Math.max(0,n(r.freeNetLimit)-n(r.freeNetUsed));
 return {delegated,free,available:Math.max(delegated,free)};
}
