import 'server-only';
import {createHash} from 'node:crypto';
import {Transaction,Interface,getAddress} from 'ethers';
import {TronWeb,utils} from 'tronweb';
import {verifyTronUsdtDeposit,tronUsdtContract} from './tron-deposit-verification';
import type {signTrc20Usdt} from './vercel-treasury-signer';
import {verifyBep20UsdtDeposit,bep20UsdtContract} from './bep20-deposit-verification';
import {treasuryDestination} from './treasury-addresses';
import type {WalletDb} from './wallet-engine';
const token=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
type Evidence=Parameters<typeof verifyBep20UsdtDeposit>[0];
/** PRIVATE trusted-observer boundary, not a public receipt endpoint.
 * Successful final evidence only. Missing/failed/expired/conflicting evidence NEVER releases a source.
 * Does not broadcast, post a ledger entry, or prove node authenticity.
 */
export async function confirmBep20Sweep(db:WalletDb,input:{sweepId:string;evidence:Evidence}){
 return confirmVerifiedSweep(db,input.sweepId,verifyBep20UsdtDeposit(input.evidence));
}
export async function confirmTronSweep(db:WalletDb,input:{sweepId:string;evidence:Parameters<typeof verifyTronUsdtDeposit>[0]}){
 return confirmVerifiedSweep(db,input.sweepId,verifyTronUsdtDeposit(input.evidence));
}
type VerifiedEvent=ReturnType<typeof verifyBep20UsdtDeposit>|ReturnType<typeof verifyTronUsdtDeposit>;
async function confirmVerifiedSweep(db:WalletDb,sweepId:string,event:VerifiedEvent){
 if(!/^[a-f0-9-]{36}$/i.test(sweepId))throw new Error('INVALID_SWEEP_ID');
 const fingerprint=createHash('sha256').update(JSON.stringify(event)).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const {rows:[locator]}=await tx.query('SELECT "addressId" FROM "SignedSweepOutbox" WHERE id=$1',[sweepId]);
  if(!locator)throw new Error('SWEEP_NOT_FOUND');
  // Same source-before-outbox lock order as signing preparation.
  const {rows:[source]}=await tx.query('SELECT address,network FROM "UserDepositAddress" WHERE id=$1 FOR UPDATE',[locator.addressId]);
  const {rows:[row]}=await tx.query('SELECT * FROM "SignedSweepOutbox" WHERE id=$1 FOR UPDATE',[sweepId]);
  if(!row||!source||row.addressId!==locator.addressId||row.network!==event.network||source.network!==event.network)throw new Error('SWEEP_SOURCE_MISMATCH');
  if(event.network==='BEP20'){
   const signed=Transaction.from(String(row.signedPayload));
   if(!signed.hash||!signed.from||signed.chainId!==56n||signed.type!==0||signed.value!==0n||
     signed.to!==getAddress(bep20UsdtContract)||signed.hash.toLowerCase()!==String(row.txId).toLowerCase()||
     signed.hash.slice(2).toLowerCase()!==event.txId||signed.from!==getAddress(String(source.address))||
     String(signed.nonce)!==String(row.senderNonce))throw new Error('SWEEP_SIGNED_IDENTITY_MISMATCH');
   const decoded=token.decodeFunctionData('transfer',signed.data);
   if(signed.data!==token.encodeFunctionData('transfer',[decoded[0],decoded[1]])||
     getAddress(decoded[0])!==treasuryDestination('BEP20','operating')||event.to!==getAddress(decoded[0])||
     event.from!==signed.from||event.amountBaseUnits!==String(decoded[1]))throw new Error('SWEEP_EXECUTION_MISMATCH');
  }else{
   const signed=JSON.parse(String(row.signedPayload)) as ReturnType<typeof signTrc20Usdt>['transaction'];
   if(!utils.transaction.txCheck(signed)||signed.txID!==row.txId||signed.txID!==event.txId||
      signed.signature?.length!==1||signed.raw_data.contract.length!==1)throw new Error('SWEEP_SIGNED_IDENTITY_MISMATCH');
   const recovered=utils.crypto.ecRecover(signed.txID,signed.signature[0]).toLowerCase();
   const contract=signed.raw_data.contract[0];
   const value=contract.parameter.value as {owner_address:string;contract_address:string;data:string;call_value?:number;call_token_value?:number;token_id?:number};
   const sender=TronWeb.address.toHex(String(source.address)).toLowerCase();
   if(contract.type!=='TriggerSmartContract'||recovered!==sender||value.owner_address.toLowerCase()!==sender||
      value.contract_address.toLowerCase()!==TronWeb.address.toHex(tronUsdtContract).toLowerCase()||
      (value.call_value??0)!==0||(value.call_token_value??0)!==0||(value.token_id??0)!==0||row.senderNonce!==null)throw new Error('SWEEP_SIGNED_IDENTITY_MISMATCH');
   const destination=treasuryDestination('TRC20','operating');
   const expected='a9059cbb'+TronWeb.address.toHex(destination).slice(2).toLowerCase().padStart(64,'0')+BigInt(event.amountBaseUnits).toString(16).padStart(64,'0');
   if(value.data!==expected||event.to!==destination||event.from!==String(source.address))throw new Error('SWEEP_EXECUTION_MISMATCH');
  }
  const {rows:[prior]}=await tx.query('SELECT fingerprint FROM "SweepConfirmation" WHERE "sweepId"=$1',[sweepId]);
  if(prior){
   if(prior.fingerprint!==fingerprint||row.state!=='CONFIRMED')throw new Error('SWEEP_CONFIRMATION_CONFLICT');
   return {id:String(row.id),txId:String(row.txId),state:'CONFIRMED' as const};
  }
  if(row.state!=='SIGNED'&&row.state!=='BROADCAST_UNKNOWN')throw new Error('SWEEP_STATE_CONFLICT');
  await tx.query('INSERT INTO "SweepConfirmation" ("sweepId",fingerprint,evidence) VALUES ($1,$2,$3::jsonb)',[row.id,fingerprint,JSON.stringify(event)]);
  await tx.query('UPDATE "SignedSweepOutbox" SET state=\'CONFIRMED\' WHERE id=$1',[row.id]);
  await tx.query('UPDATE "SweepDispatchAuthorization" SET state=\'SETTLED\',"settledAt"=statement_timestamp() WHERE "sweepId"=$1 AND state=\'HELD\'',[row.id]);
  return {id:String(row.id),txId:String(row.txId),state:'CONFIRMED' as const};
 });
}
