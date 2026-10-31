import 'server-only';
import {HDKey} from '@scure/bip32';
import {deriveTronDepositAddress} from './tron-addresses';
import {deriveBep20DepositAddress} from './evm-deposit-addresses';
import {treasuryDestination} from './treasury-addresses';
import {signTrc20Usdt,signBep20Usdt} from './vercel-treasury-signer';

type Base={accountXprv:string;accountXpub:string;index:number;assignedAddress:string;maxAmountBaseUnits:bigint;maxNetworkFeeBaseUnits:bigint};
type TrcSweep=Base&{network:'TRC20';transaction:Omit<Parameters<typeof signTrc20Usdt>[2],'destination'>};
type BepSweep=Base&{network:'BEP20';transaction:Omit<Parameters<typeof signBep20Usdt>[2],'destination'>};
/** Offline signing primitive, NOT authority to dispatch. Caller supplies a trusted DB assignment
 * and claimed sweep budget. No request-body policy/keys, arbitrary destination or broadcast.
 */
export async function signDepositSweep(input:TrcSweep|BepSweep,now=Date.now()){
 if(input.network!=='TRC20'&&input.network!=='BEP20')throw new Error('UNSUPPORTED_DEPOSIT_NETWORK');
 if(!Number.isSafeInteger(input.index)||input.index<0||input.index>=0x80000000)throw new Error('INVALID_ADDRESS_INDEX');
 if(typeof input.accountXprv!=='string'||!/^xprv[1-9A-HJ-NP-Za-km-z]{100,110}$/.test(input.accountXprv))throw new Error('DEPOSIT_ACCOUNT_PRIVATE_KEY_REQUIRED');
 let account:HDKey|undefined,branch:HDKey|undefined,child:HDKey|undefined;
 try{
  try{account=HDKey.fromExtendedKey(input.accountXprv)}catch{throw new Error('INVALID_DEPOSIT_ACCOUNT_KEY')}
  if(!account.privateKey||account.depth!==3||account.index!==0x80000000)throw new Error('DEPOSIT_ACCOUNT_ZERO_REQUIRED');
  // Never accept a secret for a different public vault, even when the address is syntactically valid.
  if(account.publicExtendedKey!==input.accountXpub)throw new Error('DEPOSIT_PUBLIC_PRIVATE_ACCOUNT_MISMATCH');
  const derived=(input.network==='TRC20'?deriveTronDepositAddress:deriveBep20DepositAddress)(input.accountXpub,input.index);
  // Canonical checksum/address must match the immutable DB assignment exactly.
  if(input.assignedAddress!==derived.address)throw new Error('DEPOSIT_ASSIGNMENT_MISMATCH');
  branch=account.deriveChild(0);child=branch.deriveChild(input.index);
  if(!child.privateKey)throw new Error('DEPOSIT_CHILD_KEY_UNAVAILABLE');
  const key=Buffer.from(child.privateKey).toString('hex');
  const policy={expectedSender:derived.address,maxAmountBaseUnits:input.maxAmountBaseUnits,maxNetworkFeeBaseUnits:input.maxNetworkFeeBaseUnits};
  // Fixed operating address. Any extra destination property at runtime is overwritten here.
  if(input.network==='TRC20')return signTrc20Usdt(key,policy,{...input.transaction,destination:treasuryDestination('TRC20','operating')},now);
  return await signBep20Usdt(key,policy,{...input.transaction,destination:treasuryDestination('BEP20','operating')});
 }finally{
  child?.wipePrivateData();branch?.wipePrivateData();account?.wipePrivateData();
  // Best effort only: JavaScript/library strings and copies cannot be guaranteed zeroized.
 }
}

/** No public endpoint. No keys are created/imported by this function. Preview cannot load secrets. */
export function depositHdSigningConfiguration(network:'TRC20'|'BEP20'){
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_SIGNER_ENABLED!=='true')throw new Error('LIVE_SIGNING_DISABLED');
 if(network!=='TRC20'&&network!=='BEP20')throw new Error('UNSUPPORTED_DEPOSIT_NETWORK');
 const accountXprv=process.env[`SIRO_${network}_DEPOSIT_ACCOUNT_XPRV`];
 const accountXpub=process.env[`SIRO_${network}_DEPOSIT_ACCOUNT_XPUB`];
 if(!accountXprv||!accountXpub)throw new Error('DEPOSIT_SIGNING_CONFIGURATION_MISSING');
 return {accountXprv,accountXpub};
}
