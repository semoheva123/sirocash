/** Offline, read-only reconciliation of normalized authorized exports. Never posts ledger entries. */
import {z} from 'zod';
const row=z.object({reference:z.string().min(1).max(200),asset:z.enum(['USDT','USDC','USD']),network:z.string().min(1).max(40),amountMicros:z.string().regex(/^-?\d{1,24}$/)}).strict();
export const reconciliationSchema=z.object({ledger:z.array(row).max(100000),provider:z.array(row).max(100000)}).strict();
export type ReconciliationInput=z.infer<typeof reconciliationSchema>;
export function reconcile(input:ReconciliationInput){
 const errors:Array<{side:'ledger'|'provider'|'comparison';reference:string;reason:'duplicate_reference'|'missing_provider'|'missing_ledger'|'amount_or_asset_mismatch'}>=[];
 const maps={ledger:new Map<string,z.infer<typeof row>>(),provider:new Map<string,z.infer<typeof row>>()};
 for(const side of ['ledger','provider'] as const)for(const item of input[side]){
  if(maps[side].has(item.reference))errors.push({side,reference:item.reference,reason:'duplicate_reference'});
  else maps[side].set(item.reference,item);
 }
 for(const [ref,l] of maps.ledger){
  const p=maps.provider.get(ref);
  if(!p)errors.push({side:'comparison',reference:ref,reason:'missing_provider'});
  else if(l.asset!==p.asset||l.network!==p.network||BigInt(l.amountMicros)!==BigInt(p.amountMicros))errors.push({side:'comparison',reference:ref,reason:'amount_or_asset_mismatch'});
 }
 for(const ref of maps.provider.keys())if(!maps.ledger.has(ref))errors.push({side:'comparison',reference:ref,reason:'missing_ledger'});
 return {matched:errors.length===0,ledgerRows:input.ledger.length,providerRows:input.provider.length,errors};
}
