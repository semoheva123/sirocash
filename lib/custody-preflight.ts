import 'server-only';
import {HDKey} from '@scure/bip32';
import {TronWeb} from 'tronweb';
import {checkDepositWalletSetup} from './deposit-wallet-setup';
import {treasuryDestination} from './treasury-addresses';
/** No signing, RPC, DB, secret echo or provisioning. JS strings cannot be guaranteed zeroized. */
export function verifyTronCustodyKeys(input:{operatingPrivateKey:string;accountXprv:string;accountXpub:string;expectedOperatingAddress:string;expectedFirstAddress:string}){
 let account:HDKey|undefined;
 try{
  if(typeof input.operatingPrivateKey!=='string'||! /^(0x)?[a-f0-9]{64}$/i.test(input.operatingPrivateKey))throw new Error();
  const address=TronWeb.address.fromPrivateKey(input.operatingPrivateKey.replace(/^0x/,''));
  if(!address||address!==input.expectedOperatingAddress)throw new Error();
  if(typeof input.accountXprv!=='string'||!/^xprv[1-9A-HJ-NP-Za-km-z]{100,110}$/.test(input.accountXprv))throw new Error();
  account=HDKey.fromExtendedKey(input.accountXprv);
  if(!account.privateKey||account.depth!==3||account.index!==0x80000000||account.publicExtendedKey!==input.accountXpub)throw new Error();
  checkDepositWalletSetup({network:'TRC20',accountXpub:input.accountXpub,firstAddress:input.expectedFirstAddress,origin:"m/44'/195'/0'"});
  if(input.expectedFirstAddress===input.expectedOperatingAddress)throw new Error();
  return {network:'TRC20',operatingKeyMatched:true,depositAccountKeysMatched:true,firstAddressMatched:true,signingEnabled:false} as const;
 }catch{throw new Error('CUSTODY_KEY_BINDING_CHECK_FAILED')}
 finally{account?.wipePrivateData()}
}
export function runCustodyPreflight(env:Record<string,string|undefined>=process.env){
 if(env.SIRO_CUSTODY_PREFLIGHT!=='true')return {status:'SKIPPED'} as const;
 if(env.VERCEL_ENV!=='production'||env.SIRO_SIGNER_ENABLED!=='false')throw new Error('CUSTODY_PREFLIGHT_REQUIRES_DISABLED_PRODUCTION_SIGNER');
 const keys=['SIRO_TRC20_OPERATING_PRIVATE_KEY','SIRO_TRC20_DEPOSIT_ACCOUNT_XPRV','SIRO_TRC20_DEPOSIT_ACCOUNT_XPUB','SIRO_TRC20_DEPOSIT_FIRST_ADDRESS'] as const;
 if(keys.some(key=>!env[key]))throw new Error('CUSTODY_PREFLIGHT_CONFIGURATION_MISSING');
 return verifyTronCustodyKeys({operatingPrivateKey:env[keys[0]]!,accountXprv:env[keys[1]]!,accountXpub:env[keys[2]]!,expectedOperatingAddress:treasuryDestination('TRC20','operating'),expectedFirstAddress:env[keys[3]]!});
}

/** Deposit-account binding only; does not prove hardened ancestry or shared seed with TRON. */
export function verifyBep20DepositKeys(input:{accountXprv:string;accountXpub:string;expectedFirstAddress:string}){
 let account:HDKey|undefined;
 try{
  if(typeof input.accountXprv!=='string'||!/^xprv[1-9A-HJ-NP-Za-km-z]{100,110}$/.test(input.accountXprv))throw new Error();
  account=HDKey.fromExtendedKey(input.accountXprv);
  if(!account.privateKey||account.depth!==3||account.index!==0x80000000||account.publicExtendedKey!==input.accountXpub)throw new Error();
  const checked=checkDepositWalletSetup({network:'BEP20',accountXpub:input.accountXpub,firstAddress:input.expectedFirstAddress,origin:"m/44'/60'/0'"});
  if(checked.firstAddress===treasuryDestination('BEP20','operating'))throw new Error();
  return {network:'BEP20',chainId:56,depositAccountKeysMatched:true,firstAddressMatched:true,signingEnabled:false} as const;
 }catch{throw new Error('CUSTODY_KEY_BINDING_CHECK_FAILED')}
 finally{account?.wipePrivateData()}
}
export function runBep20DepositPreflight(env:Record<string,string|undefined>=process.env){
 if(env.SIRO_BEP20_CUSTODY_PREFLIGHT!=='true')return {status:'SKIPPED'} as const;
 if(env.VERCEL_ENV!=='production'||env.SIRO_SIGNER_ENABLED!=='false')throw new Error('CUSTODY_PREFLIGHT_REQUIRES_DISABLED_PRODUCTION_SIGNER');
 const keys=['SIRO_BEP20_DEPOSIT_ACCOUNT_XPRV','SIRO_BEP20_DEPOSIT_ACCOUNT_XPUB','SIRO_BEP20_DEPOSIT_FIRST_ADDRESS'] as const;
 if(keys.some(key=>!env[key]))throw new Error('CUSTODY_PREFLIGHT_CONFIGURATION_MISSING');
 return verifyBep20DepositKeys({accountXprv:env[keys[0]]!,accountXpub:env[keys[1]]!,expectedFirstAddress:env[keys[2]]!});
}
