import 'server-only';
import {Transaction,Interface,getAddress} from 'ethers';
import {TronWeb,utils} from 'tronweb';
import {bep20UsdtContract} from './bep20-deposit-verification';
import {tronUsdtContract} from './tron-deposit-verification';
import type {signTrc20Usdt} from './vercel-treasury-signer';
import {moneyMicros} from './wallet-engine';
const token=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
/** Private immutable signed-payout verification; finality may be observed after TRON expiry. */
export function validateSavedPayout(payout:Record<string,unknown>,quote:Record<string,unknown>,options:{now?:number;allowExpired?:boolean}={}){
  const expectedAmount=moneyMicros(String(quote.netTokens))*(payout.network==='BEP20'?10n**12n:1n);
  if(expectedAmount!==BigInt(String(payout.amountBaseUnits))||payout.recipient!==quote.recipient)throw new Error('PAYOUT_NET_AMOUNT_CONFLICT');
  let maxFee:bigint;
  if(payout.network==='BEP20'){
   const signed=Transaction.from(String(payout.signedPayload));
   const decoded=token.decodeFunctionData('transfer',signed.data);
   if(signed.hash!==payout.txId||signed.from!==getAddress(String(payout.sender))||signed.chainId!==56n||signed.type!==0||signed.value!==0n||signed.to!==getAddress(bep20UsdtContract)||String(signed.nonce)!==String(payout.senderNonce)||decoded[0]!==getAddress(String(quote.recipient))||String(decoded[1])!==String(payout.amountBaseUnits)||signed.data!==token.encodeFunctionData('transfer',[decoded[0],decoded[1]])||!signed.gasPrice)throw new Error('PAYOUT_SAVED_SIGNATURE_INVALID');
   maxFee=signed.gasLimit*signed.gasPrice;
  }else if(payout.network==='TRC20'){
   const signed=JSON.parse(String(payout.signedPayload)) as ReturnType<typeof signTrc20Usdt>['transaction'];
   if(!utils.transaction.txCheck(signed)||signed.txID!==payout.txId||signed.signature?.length!==1||signed.raw_data.contract.length!==1)throw new Error('PAYOUT_SAVED_SIGNATURE_INVALID');
   const contract=signed.raw_data.contract[0],v=contract.parameter.value as {owner_address:string;contract_address:string;data:string;call_value?:number;call_token_value?:number;token_id?:number};
   const sender=TronWeb.address.toHex(String(payout.sender)).toLowerCase();
   const data='a9059cbb'+TronWeb.address.toHex(String(quote.recipient)).slice(2).toLowerCase().padStart(64,'0')+BigInt(String(payout.amountBaseUnits)).toString(16).padStart(64,'0');
   if(contract.type!=='TriggerSmartContract'||v.owner_address.toLowerCase()!==sender||utils.crypto.ecRecover(signed.txID,signed.signature[0]).toLowerCase()!==sender||v.contract_address.toLowerCase()!==TronWeb.address.toHex(tronUsdtContract).toLowerCase()||v.data!==data||(v.call_value??0)!==0||(v.call_token_value??0)!==0||(v.token_id??0)!==0||(!options.allowExpired&&signed.raw_data.expiration<=(options.now??Date.now())))throw new Error('PAYOUT_SAVED_SIGNATURE_INVALID_OR_EXPIRED');
   if(typeof signed.raw_data.fee_limit!=='number'||!Number.isSafeInteger(signed.raw_data.fee_limit)||signed.raw_data.fee_limit<=0)throw new Error('PAYOUT_FEE_INVALID');
   maxFee=BigInt(signed.raw_data.fee_limit);
  }else throw new Error('PAYOUT_NETWORK_INVALID');
  return maxFee;
}
