import 'server-only';
import {nativeExpenseUsage} from './native-expense-usage';
import {createHash,randomUUID} from 'node:crypto';
import {Transaction,Interface,getAddress} from 'ethers';
import {utils} from 'tronweb';
import type {WalletDb,WalletTx} from './wallet-engine';
import {validateSavedPayout} from './payout-signature';
import {bep20UsdtContract} from './bep20-deposit-verification';
import {treasuryDestination} from './treasury-addresses';
import type {ChainSendInput} from './chain-broadcast';
const abi=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type SweepResources={network:'TRC20'|'BEP20';txId:string;sender:string;observedAt:string;expiresAt:string;tokenBalance:bigint;nativeBalance:bigint;resourceCost:bigint;pendingNonce?:number;estimatedGas?:bigint;accountActive?:boolean;requiredEnergy?:number;availableEnergy?:number;requiredBandwidth?:number;availableBandwidth?:number};
async function lockedSweep(tx:WalletTx,id:string){
 const {rows:[loc]}=await tx.query('SELECT "addressId" FROM "SignedSweepOutbox" WHERE id=$1',[id]);
 const {rows:[source]}=await tx.query('SELECT * FROM "UserDepositAddress" WHERE id=$1 FOR UPDATE',[loc?.addressId]);
 const {rows:[vault]}=await tx.query('SELECT enabled,"originVerified",network FROM "DepositAddressVault" WHERE id=$1 FOR UPDATE',[source?.vaultId]);
 if(!vault||vault.enabled!==true||vault.originVerified!==true||vault.network!==source?.network)throw new Error('SWEEP_VAULT_DISABLED');
 const {rows:[sweep]}=await tx.query('SELECT * FROM "SignedSweepOutbox" WHERE id=$1 FOR UPDATE',[id]);
 if(!source||!sweep||sweep.addressId!==source.id||source.network!==sweep.network)throw new Error('SWEEP_SOURCE_CONFLICT');
 return {source,sweep};
}
/** Reuse the withdrawal signature validator with the exact persisted sweep sender/recipient/amount. */
function validate(sweep:Record<string,unknown>,sender:string){
 const network=sweep.network;if(network!=='BEP20'&&network!=='TRC20')throw new Error('SWEEP_NETWORK');
 let amount:bigint;
 if(network==='BEP20')amount=abi.decodeFunctionData('transfer',Transaction.from(String(sweep.signedPayload)).data)[1];
 else{const signed=JSON.parse(String(sweep.signedPayload));if(!utils.transaction.txCheck(signed))throw new Error('SWEEP_SIGNATURE');amount=BigInt('0x'+signed.raw_data.contract[0].parameter.value.data.slice(-64))}
 if(amount<=0n||amount>=2n**256n)throw new Error('SWEEP_AMOUNT');
 if(network==='BEP20'){
  const t=Transaction.from(String(sweep.signedPayload)),recipient=treasuryDestination(network,'operating');
  if(!t.signature||t.chainId!==56n||t.type!==0||t.hash!==sweep.txId||t.from!==getAddress(sender)||t.to!==getAddress(bep20UsdtContract)||t.value!==0n||String(t.nonce)!==String(sweep.senderNonce)||!t.gasPrice||t.gasLimit<21000n||t.data!==abi.encodeFunctionData('transfer',[recipient,amount]))throw new Error('SWEEP_SIGNATURE');
  return {amount,fee:t.gasLimit*t.gasPrice,recipient};
 }
 const micros=amount;
 const tokens=`${micros/1000000n}.${String(micros%1000000n).padStart(6,'0')}`;
 const recipient=treasuryDestination(network,'operating');
 const fee=validateSavedPayout({...sweep,sender,recipient,amountBaseUnits:amount.toString()},{netTokens:tokens,recipient});
 return {amount,fee,recipient};
}
/** Trusted observer evidence ONLY. Shared network expense policy and mutex with payouts. */
export async function authorizeSweepDispatch(db:WalletDb,id:string,e:SweepResources){
 if(!uuid.test(id)||![e.tokenBalance,e.nativeBalance,e.resourceCost].every(n=>typeof n==='bigint'&&n>=0n&&n<10n**78n)||![e.observedAt,e.expiresAt].every(s=>Number.isFinite(Date.parse(s))))throw new Error('SWEEP_RESOURCE_INPUT');
 const json=JSON.stringify(e,(_k,v)=>typeof v==='bigint'?v.toString():v),hash=createHash('sha256').update(json).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const {source,sweep}=await lockedSweep(tx,id);
  if(e.network!==sweep.network||e.sender!==source.address||e.txId!==sweep.txId)throw new Error('SWEEP_RESOURCE_BINDING');
  const {rows:[prior]}=await tx.query('SELECT *,"expiresAt"<=clock_timestamp() AS stale FROM "SweepDispatchAuthorization" WHERE "sweepId"=$1',[id]);
  if(prior){if(prior.evidenceHash===hash)return {state:'ALREADY_RESERVED'};if(prior.stale!==true||prior.claimId||prior.state!=='HELD')throw new Error('SWEEP_RESOURCE_CONFLICT')}
  if(sweep.state!=='SIGNED')throw new Error('SWEEP_NOT_AUTHORIZABLE');
  const {rows:[fresh]}=await tx.query(`SELECT $1::timestamptz<=clock_timestamp() AND $1::timestamptz>=clock_timestamp()-interval '30 seconds' AND $2::timestamptz>clock_timestamp() AND $2::timestamptz<=$1::timestamptz+interval '30 seconds' AS ok`,[e.observedAt,e.expiresAt]);
  if(fresh?.ok!==true)throw new Error('SWEEP_RESOURCE_STALE');
  const {amount,fee}=validate(sweep,String(source.address));
  if(e.tokenBalance<amount||(e.network==='BEP20'&&e.nativeBalance<fee))throw new Error('SWEEP_BALANCE_INSUFFICIENT');
  if(e.network==='BEP20'){
   const signed=Transaction.from(String(sweep.signedPayload));
   if(e.resourceCost!==0n||e.pendingNonce!==signed.nonce||typeof e.estimatedGas!=='bigint'||e.estimatedGas<21000n||e.estimatedGas>signed.gasLimit)throw new Error('SWEEP_NONCE_OR_GAS');
  }else{
   const q=[e.requiredEnergy,e.availableEnergy,e.requiredBandwidth,e.availableBandwidth];
   if(e.accountActive!==true||!q.every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)||!e.requiredEnergy||!e.requiredBandwidth||e.availableEnergy!<e.requiredEnergy||e.availableBandwidth!<e.requiredBandwidth)throw new Error('SWEEP_RESOURCES_UNDELIVERED');
  }
  const cost=fee+e.resourceCost;
  if(prior&&BigInt(String(prior.expense))!==cost)throw new Error('SWEEP_REFRESH_BUDGET_CHANGED');
  const {rows:[policy]}=await tx.query('SELECT * FROM "PayoutExpensePolicy" WHERE network=$1 FOR UPDATE',[e.network]);
  if(!policy||policy.enabled!==true||cost>BigInt(String(policy.perPayoutCap)))throw new Error('SWEEP_EXPENSE_POLICY');
  const used=await nativeExpenseUsage(tx,e.network);
  if(used+(prior?0n:cost)>BigInt(String(policy.dailyCap)))throw new Error('SWEEP_DAILY_EXPENSE_CAP');
  if(prior){
   await tx.query('INSERT INTO "DispatchApprovalHistory"(id,kind,"outboxId",previous) SELECT $2,\'SWEEP\',"sweepId",to_jsonb(a) FROM "SweepDispatchAuthorization" a WHERE "sweepId"=$1',[id,randomUUID()]);
   await tx.query('UPDATE "SweepDispatchAuthorization" SET "evidenceHash"=$2,evidence=$3::jsonb,"approvedAt"=$4,"expiresAt"=$5 WHERE "sweepId"=$1',[id,hash,json,e.observedAt,e.expiresAt]);
   return {state:'REFRESHED'};
  }
  await tx.query('INSERT INTO "SweepDispatchAuthorization" ("sweepId",network,"txId","payloadHash","maxFee",expense,"evidenceHash",evidence,"approvedAt","expiresAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)',[id,e.network,sweep.txId,createHash('sha256').update(String(sweep.signedPayload)).digest('hex'),fee.toString(),cost.toString(),hash,json,e.observedAt,e.expiresAt]);
  return {state:'RESERVED'};
 });
}
export async function dispatchSavedSweep(db:WalletDb,id:string,options:{enabled?:boolean;send:(i:ChainSendInput)=>Promise<{txId:string}>;timeoutMs?:number}){
 if(options.enabled!==true)throw new Error('SWEEP_DISPATCH_DISABLED');
 const timeout=options.timeoutMs??10000;if(!uuid.test(id)||!Number.isSafeInteger(timeout)||timeout<100||timeout>30000)throw new Error('SWEEP_DISPATCH_INPUT');
 const claim=await db.transaction(async tx=>{
  const {source,sweep}=await lockedSweep(tx,id);
  if(sweep.state==='CONFIRMED')return {state:'CONFIRMED'};
  const {rows:[a]}=await tx.query('SELECT *,"approvedAt"<=clock_timestamp() AND "expiresAt">clock_timestamp() AS fresh FROM "SweepDispatchAuthorization" WHERE "sweepId"=$1 FOR UPDATE',[id]);
  if(a?.claimId)return {state:String(a.dispatchState)};
  if(sweep.state!=='SIGNED'||!a||a.state!=='HELD'||a.fresh!==true||a.txId!==sweep.txId||a.payloadHash!==createHash('sha256').update(String(sweep.signedPayload)).digest('hex'))throw new Error('SWEEP_DISPATCH_APPROVAL');
  const {fee}=validate(sweep,String(source.address));if(fee>BigInt(String(a.maxFee)))throw new Error('SWEEP_FEE_CAP');
  const claimId=randomUUID();
  await tx.query('UPDATE "SweepDispatchAuthorization" SET "claimId"=$2,"consumedAt"=statement_timestamp(),"dispatchState"=\'UNKNOWN\' WHERE "sweepId"=$1',[id,claimId]);
  await tx.query('UPDATE "SignedSweepOutbox" SET state=\'BROADCAST_UNKNOWN\' WHERE id=$1',[id]);
  return {state:'CLAIMED',claimId,network:sweep.network as 'TRC20'|'BEP20',txId:String(sweep.txId),signedPayload:String(sweep.signedPayload),expiresAt:new Date(String(a.expiresAt)).getTime()};
 });
 if(!('claimId' in claim))return {state:claim.state};
 if(!Number.isFinite(claim.expiresAt)||Date.now()>=claim.expiresAt!)return {state:'UNKNOWN'};
 const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const r=await Promise.race([options.send({network:claim.network!,txId:claim.txId!,signedPayload:claim.signedPayload!,signal:abort.signal}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error())},timeout)})]);
  if(r.txId.toLowerCase()!==claim.txId!.toLowerCase())return {state:'UNKNOWN'};
  await db.transaction(tx=>tx.query('UPDATE "SweepDispatchAuthorization" SET "dispatchState"=\'ACKNOWLEDGED\' WHERE "sweepId"=$1 AND "claimId"=$2 AND "dispatchState"=\'UNKNOWN\'',[id,claim.claimId]));
  return {state:'ACKNOWLEDGED'};
 }catch{return {state:'UNKNOWN'}}finally{if(timer)clearTimeout(timer);abort.abort()}
}
