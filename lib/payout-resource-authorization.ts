import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {Transaction} from 'ethers';
import {validateSavedPayout} from './payout-signature';
import type {WalletDb} from './wallet-engine';
type Common={txId:string;sender:string;observerReference:string;observedAt:string;expiresAt:string;tokenBalanceBaseUnits:bigint;nativeBalanceBaseUnits:bigint;resourceCostBaseUnits:bigint};
type Evidence=Common&({network:'BEP20';pendingNonce:number;estimatedGas:bigint}|{network:'TRC20';accountActive:boolean;requiredEnergy:number;availableEnergy:number;requiredBandwidth:number;availableBandwidth:number});
/** PRIVATE authority consumer, NEVER customer evidence. A trusted live observer/simulator must
 * establish exact sender/token balances, nonce, simulation and delivered resources before calling.
 * Native budgets are independent of USD customer fees and do NOT enforce the estimated $3 cycle.
 */
export async function authorizePayoutDispatch(db:WalletDb,payoutId:string,e:Evidence){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payoutId)||!['BEP20','TRC20'].includes(e.network)||typeof e.observerReference!=='string'||e.observerReference.length<8||e.observerReference.length>200||![e.observedAt,e.expiresAt].every(v=>Number.isFinite(Date.parse(v)))||[e.tokenBalanceBaseUnits,e.nativeBalanceBaseUnits,e.resourceCostBaseUnits].some(v=>typeof v!=='bigint'||v<0n||v>=10n**78n))throw new Error('INVALID_PAYOUT_RESOURCE_EVIDENCE');
 const json=JSON.stringify(e,(_key,v)=>typeof v==='bigint'?v.toString():v),evidenceHash=createHash('sha256').update(json).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const {rows:[locator]}=await tx.query('SELECT "quoteId" FROM "SignedWithdrawalOutbox" WHERE id=$1',[payoutId]);
  if(!locator)throw new Error('PAYOUT_NOT_FOUND');
  const {rows:[quote]}=await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE id=$1 FOR UPDATE',[locator.quoteId]);
  const {rows:[operation]}=await tx.query('SELECT * FROM "WalletOperation" WHERE id=$1 FOR UPDATE',[quote?.operationId]);
  const {rows:[payout]}=await tx.query('SELECT * FROM "SignedWithdrawalOutbox" WHERE id=$1 FOR UPDATE',[payoutId]);
  if(!quote||!operation||!payout||payout.operationId!==operation.id||operation.destination!=='USDTQ:'+quote.id||quote.network!==e.network||payout.network!==e.network||payout.sender!==e.sender||payout.txId!==e.txId)throw new Error('PAYOUT_RESOURCE_IDENTITY_CONFLICT');
  const {rows:[prior]}=await tx.query('SELECT r.*,a."consumedAt",a."expiresAt"<=clock_timestamp() AS stale FROM "PayoutExpenseReservation" r JOIN "PayoutDispatchApproval" a USING("payoutId") WHERE r."payoutId"=$1',[payoutId]);
  if(prior){if(prior.evidenceHash===evidenceHash)return {payoutId,state:'ALREADY_RESERVED'};if(prior.stale!==true||prior.consumedAt||prior.state!=='HELD')throw new Error('PAYOUT_RESOURCE_EVIDENCE_CONFLICT')}
  if(payout.state!=='SIGNED'||operation.state!=='SUBMITTED')throw new Error('PAYOUT_NOT_AUTHORIZABLE');
  const {rows:[fresh]}=await tx.query(`SELECT $1::timestamptz<=clock_timestamp() AND $1::timestamptz>=clock_timestamp()-INTERVAL '30 seconds' AND $2::timestamptz>clock_timestamp() AND $2::timestamptz<=$1::timestamptz+INTERVAL '30 seconds' AS valid`,[e.observedAt,e.expiresAt]);
  if(fresh?.valid!==true)throw new Error('PAYOUT_RESOURCE_EVIDENCE_STALE');
  const maxFee=validateSavedPayout(payout,quote);
  if(e.tokenBalanceBaseUnits<BigInt(String(payout.amountBaseUnits))||(e.network==='BEP20'&&e.nativeBalanceBaseUnits<maxFee))throw new Error('PAYOUT_CHAIN_BALANCE_INSUFFICIENT');
  if(e.network==='BEP20'){
   const signed=Transaction.from(String(payout.signedPayload));
   if(!Number.isSafeInteger(e.pendingNonce)||e.pendingNonce!==signed.nonce||typeof e.estimatedGas!=='bigint'||e.estimatedGas<21000n||e.estimatedGas>signed.gasLimit||e.resourceCostBaseUnits!==0n)throw new Error('PAYOUT_GAS_OR_NONCE_UNAVAILABLE');
  }else{
   const quantities=[e.requiredEnergy,e.availableEnergy,e.requiredBandwidth,e.availableBandwidth];
   if(!quantities.every(v=>Number.isSafeInteger(v)&&v>=0)||e.accountActive!==true||e.requiredEnergy<=0||e.requiredBandwidth<=0||e.availableEnergy<e.requiredEnergy||e.availableBandwidth<e.requiredBandwidth)throw new Error('PAYOUT_TRON_RESOURCES_UNDELIVERED');
  }
  const cost=maxFee+e.resourceCostBaseUnits;
  if(prior&&BigInt(String(prior.amountBaseUnits))!==cost)throw new Error('PAYOUT_REFRESH_BUDGET_CHANGED');
  const {rows:[policy]}=await tx.query('SELECT * FROM "PayoutExpensePolicy" WHERE network=$1 FOR UPDATE',[e.network]);
  if(!policy||policy.enabled!==true)throw new Error('PAYOUT_EXPENSE_POLICY_DISABLED');
  if(cost>BigInt(String(policy.perPayoutCap)))throw new Error('PAYOUT_EXPENSE_CAP_EXCEEDED');
  const {rows:[usage]}=await tx.query(`SELECT COALESCE(sum(n),0)::text AS used FROM (SELECT "amountBaseUnits" AS n FROM "PayoutExpenseReservation" WHERE network=$1 AND (state='HELD' OR "settledAt">=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') UNION ALL SELECT expense AS n FROM "SweepDispatchAuthorization" WHERE network=$1 AND (state='HELD' OR "settledAt">=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') UNION ALL SELECT expense AS n FROM "NativeGasOutbox" WHERE $1='BEP20' AND (state<>'CONFIRMED' OR "confirmedAt">=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) u`,[e.network]);
  if(BigInt(String(usage.used))+(prior?0n:cost)>BigInt(String(policy.dailyCap)))throw new Error('PAYOUT_DAILY_EXPENSE_CAP_EXCEEDED');
  if(prior){
   await tx.query(`INSERT INTO "DispatchApprovalHistory"(id,kind,"outboxId",previous) SELECT $2,'PAYOUT',a."payoutId",jsonb_build_object('approval',to_jsonb(a),'expense',to_jsonb(r)) FROM "PayoutDispatchApproval" a JOIN "PayoutExpenseReservation" r USING("payoutId") WHERE a."payoutId"=$1`,[payoutId,randomUUID()]);
   await tx.query('UPDATE "PayoutExpenseReservation" SET "evidenceHash"=$2,evidence=$3::jsonb WHERE "payoutId"=$1',[payoutId,evidenceHash,json]);
   await tx.query('UPDATE "PayoutDispatchApproval" SET "authorityReference"=$2,"approvedAt"=$3,"expiresAt"=$4 WHERE "payoutId"=$1',[payoutId,e.observerReference,e.observedAt,e.expiresAt]);
   return {payoutId,state:'REFRESHED'};
  }
  await tx.query('INSERT INTO "PayoutExpenseReservation" ("payoutId",network,"amountBaseUnits","evidenceHash",evidence) VALUES ($1,$2,$3,$4,$5::jsonb)',[payoutId,e.network,cost.toString(),evidenceHash,json]);
  await tx.query('INSERT INTO "PayoutDispatchApproval" ("payoutId","txId","payloadHash","authorityReference","maxNativeFeeBaseUnits","approvedAt","expiresAt") VALUES ($1,$2,$3,$4,$5,$6,$7)',[payoutId,payout.txId,createHash('sha256').update(String(payout.signedPayload)).digest('hex'),e.observerReference,maxFee.toString(),e.observedAt,e.expiresAt]);
  return {payoutId,state:'RESERVED'};
 });
}
