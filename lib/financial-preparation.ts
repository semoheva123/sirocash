import 'server-only';
import {createHash} from 'node:crypto';
import type {WalletDb} from './wallet-engine';
import {moneyMicros} from './wallet-engine';
import {treasuryDestination} from './treasury-addresses';
import {prepareSignedSweep} from './signed-sweep-outbox';
import {prepareSignedWithdrawal} from './signed-withdrawal-outbox';
import {prepareTronResourceIntent} from './tron-resource-intent';
import type {createFinancialPreflight} from './financial-preflight';
import type {createNativeGasWorker} from './native-gas';
import type {createFinancialExecution} from './financial-execution';
export type PreparationJob={id:string;kind:'PREPARE_PAYOUT'|'PREPARE_SWEEP'};
export function createFinancialPreparation(db:WalletDb,options:{enabled:boolean;bandwidthPackage?:(required:number,signal:AbortSignal)=>Promise<number>;preflight:ReturnType<typeof createFinancialPreflight>;gas:ReturnType<typeof createNativeGasWorker>;energy:ReturnType<typeof createFinancialExecution>['energy'];limits:(network:'TRC20'|'BEP20',kind?:PreparationJob['kind'])=>{maxAmount:bigint;maxFee:bigint;minimumSweep:bigint};signSweep?:typeof prepareSignedSweep;signPayout?:typeof prepareSignedWithdrawal}){
 return async(job:PreparationJob,signal:AbortSignal)=>{
  if(!options.enabled||signal.aborted)throw new Error('FINANCIAL_PREPARATION_DISABLED');
  const snapshot=await db.transaction(async tx=>{
   if(job.kind==='PREPARE_PAYOUT'){
    const {rows:[q]}=await tx.query('SELECT q.*,o.state AS "operationState" FROM "UsdtWithdrawalQuote" q JOIN "WalletOperation" o ON o.id=q."operationId" WHERE q.id=$1',[job.id]);
    if(!q||q.operationState!=='RESERVED'||!['TRC20','BEP20'].includes(String(q.network)))throw new Error('PREPARATION_QUOTE_NOT_RESERVED');
    const network=q.network as 'TRC20'|'BEP20';return {network,sender:treasuryDestination(network,'operating'),recipient:String(q.recipient),amount:moneyMicros(String(q.netTokens))*(network==='BEP20'?10n**12n:1n),requestKey:'payout:'+String(q.operationId)};
   }
   const {rows:[a]}=await tx.query('SELECT a.*,v.enabled,v."originVerified" FROM "UserDepositAddress" a JOIN "DepositAddressVault" v ON v.id=a."vaultId" WHERE a.id=$1',[job.id]);
   if(!a||a.enabled!==true||a.originVerified!==true||!['TRC20','BEP20'].includes(String(a.network)))throw new Error('PREPARATION_VAULT_DISABLED');
   const {rows:[last]}=await tx.query('SELECT id FROM "SignedSweepOutbox" WHERE "addressId"=$1 AND state=\'CONFIRMED\' ORDER BY "createdAt" DESC,id DESC LIMIT 1',[job.id]);
   const key='auto:sweep:'+createHash('sha256').update(job.id+':'+String(last?.id??'first')).digest('hex'),network=a.network as 'TRC20'|'BEP20';
   let amount:bigint|undefined,funding:{id:string;state:string}|undefined;
   if(network==='BEP20'){
    const {rows:[g]}=await tx.query('SELECT id,state,"tokenAmount" FROM "NativeGasOutbox" WHERE "requestKey"=$1',[key]);if(g){amount=BigInt(String(g.tokenAmount));funding={id:String(g.id),state:String(g.state)}}
   }else{
    const resourceKey='energy:sweep:'+createHash('sha256').update(job.id+':'+key).digest('hex');
    const {rows:[i]}=await tx.query('SELECT "amountBaseUnits" FROM "EnergyRentalIntent" WHERE "requestKey"=$1',[resourceKey]);if(i)amount=BigInt(String(i.amountBaseUnits));
   }
   return {network,sender:String(a.address),recipient:treasuryDestination(network,'operating'),amount,requestKey:key,funding};
  });
  const limits=options.limits(snapshot.network,job.kind);
  if(limits.maxAmount<=0n||limits.maxFee<=0n||limits.minimumSweep<=0n)throw new Error('PREPARATION_LIMITS');
  const policy=await db.transaction(async tx=>{const {rows:[p]}=await tx.query('SELECT * FROM "PayoutExpensePolicy" WHERE network=$1',[snapshot.network]);if(!p||p.enabled!==true||BigInt(String(p.perPayoutCap))<limits.maxFee)throw new Error('PREPARATION_POLICY');return p});
  let observed=await options.preflight({...snapshot,maxAmount:limits.maxAmount,maxFee:limits.maxFee,signal});
  if(job.kind==='PREPARE_SWEEP'&&observed.amount<limits.minimumSweep)return {state:'HELD',reason:'SWEEP_BELOW_MINIMUM'} as const;
  if('funding' in snapshot&&snapshot.funding&&snapshot.funding.state!=='CONFIRMED'&&(await options.gas.process(snapshot.funding.id,signal)).state!=='CONFIRMED')return {state:'HELD',reason:'GAS_FUNDING_PENDING'} as const;
  if(observed.network==='BEP20'&&observed.nativeBalance<observed.requiredNative){
   if(job.kind==='PREPARE_PAYOUT')return {state:'HELD',reason:'OPERATING_BNB_REQUIRED'} as const;
   const funding=await options.gas.prepare({addressId:job.id,requestKey:snapshot.requestKey,tokenAmount:observed.amount,targetBalance:(observed.requiredNative*120n+99n)/100n,gasPrice:observed.transaction.gasPrice,signal});
   if(funding.state!=='READY'&&(await options.gas.process(funding.id,signal)).state!=='CONFIRMED')return {state:'HELD',reason:'GAS_FUNDING_PENDING'} as const;
   observed=await options.preflight({...snapshot,amount:observed.amount,maxAmount:limits.maxAmount,maxFee:limits.maxFee,signal});
   if(observed.network!=='BEP20'||observed.nativeBalance<observed.requiredNative)return {state:'HELD',reason:'GAS_FUNDING_INSUFFICIENT'} as const;
  }
  if(observed.network==='TRC20'){
   // Once an intent exists it MUST be reconciled, even if another account resource now looks enough.
   const prior=await db.transaction(async tx=>{const key=job.kind==='PREPARE_PAYOUT'?'energy:payout:'+snapshot.requestKey.slice(7):'energy:sweep:'+createHash('sha256').update(job.id+':'+snapshot.requestKey).digest('hex');const {rows:[i]}=await tx.query('SELECT * FROM "EnergyRentalIntent" WHERE "requestKey"=$1',[key]);return i});
   if(prior||observed.availableEnergy<observed.requiredEnergy||observed.availableBandwidth<500){
    let intentId:string;
    if(prior){if(prior.senderAddress!==snapshot.sender||prior.recipientAddress!==snapshot.recipient||BigInt(String(prior.amountBaseUnits))!==observed.amount)throw new Error('PREPARATION_ENERGY_CONFLICT');intentId=String(prior.id)}
    else{
     const cap=await db.transaction(async tx=>{const {rows:[p]}=await tx.query('SELECT * FROM "EnergyPurchasePolicy" WHERE id=1');if(!p||p.enabled!==true)throw new Error('ENERGY_PURCHASE_POLICY_DISABLED');return BigInt(String(p.perOrderSun))});
     const remaining=BigInt(String(policy.perPayoutCap))-limits.maxFee,maxRentalSun=cap<remaining?cap:remaining;
     if(maxRentalSun<=0n)throw new Error('PREPARATION_RENTAL_BUDGET');
     let bandwidthAmount=0;
     if(observed.availableBandwidth<500){if(!options.bandwidthPackage)throw new Error('BANDWIDTH_PROVIDER_DISABLED');bandwidthAmount=await options.bandwidthPackage(500-observed.availableBandwidth,signal)}
     const target=job.kind==='PREPARE_PAYOUT'?{kind:'PAYOUT' as const,quoteId:job.id}:{kind:'SWEEP' as const,addressId:job.id,requestKey:snapshot.requestKey,amountBaseUnits:observed.amount};
     const intent=await prepareTronResourceIntent(db,{...target,bandwidthAmount,energyAmount:Math.max(50000,observed.requiredEnergy),durationMinutes:60,maxRentalSun});intentId=intent.id;
    }
    if((await options.energy(intentId,signal)).state!=='DELIVERED')return {state:'HELD',reason:'ENERGY_DELIVERY_PENDING'} as const;
    observed=await options.preflight({...snapshot,amount:observed.amount,maxAmount:limits.maxAmount,maxFee:limits.maxFee,signal});
    if(observed.network!=='TRC20'||observed.availableEnergy<observed.requiredEnergy||observed.availableBandwidth<500)return {state:'HELD',reason:'ENERGY_INSUFFICIENT'} as const;
   }
   // Exact signed bandwidth is checked by the live authorization observer before dispatch.
  }
  if(signal.aborted)throw new Error('WORKER_ABORTED');
  if(job.kind==='PREPARE_SWEEP'){
   const common={addressId:job.id,requestKey:snapshot.requestKey,maxAmountBaseUnits:limits.maxAmount,maxNetworkFeeBaseUnits:limits.maxFee};
   const saved=observed.network==='BEP20'?await (options.signSweep??prepareSignedSweep)(db,{...common,network:'BEP20',transaction:observed.transaction}):await (options.signSweep??prepareSignedSweep)(db,{...common,network:'TRC20',transaction:observed.transaction});
   return {state:'SAVED',id:saved.id,kind:'SWEEP'} as const;
  }
  const {amountBaseUnits:_amount,...transaction}=observed.transaction;
  const saved=observed.network==='BEP20'?await (options.signPayout??prepareSignedWithdrawal)(db,{quoteId:job.id,network:'BEP20',transaction:transaction as Omit<Extract<typeof observed,{network:'BEP20'}>['transaction'],'amountBaseUnits'>}):await (options.signPayout??prepareSignedWithdrawal)(db,{quoteId:job.id,network:'TRC20',transaction:transaction as Omit<Extract<typeof observed,{network:'TRC20'}>['transaction'],'amountBaseUnits'>});
  return {state:'SAVED',id:saved.id,kind:'PAYOUT'} as const;
 };
}
