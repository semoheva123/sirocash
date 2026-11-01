/** Validate a watch-only setup before provisioning. Does not enable a vault or import private keys. */
import {createHash} from 'node:crypto';
import {getAddress} from 'ethers';
import {deriveTronDepositAddress} from './tron-addresses';
import {deriveBep20DepositAddress} from './evm-deposit-addresses';
export function checkDepositWalletSetup(input:{network:'TRC20'|'BEP20';accountXpub:string;firstAddress:string;origin:string}){
 if(input.network!=='TRC20'&&input.network!=='BEP20')throw new Error('UNSUPPORTED_DEPOSIT_NETWORK');
 const origin=input.network==='TRC20'?"m/44'/195'/0'":"m/44'/60'/0'";
 if(input.origin!==origin)throw new Error('WRONG_ACCOUNT_ORIGIN');
 // Human-declared origin is not cryptographic proof of ancestry: first-address comparison is essential.
 const derive=input.network==='TRC20'?deriveTronDepositAddress:deriveBep20DepositAddress;
 const first=derive(input.accountXpub,0);
 let expected=input.firstAddress;
 if(input.network==='BEP20'){try{expected=getAddress(expected)}catch{throw new Error('INVALID_FIRST_ADDRESS')}}
 if(expected!==first.address)throw new Error('DEPOSIT_ADDRESS_MISMATCH');
 return {network:input.network,origin,firstAddress:first.address,
   accountFingerprint:createHash('sha256').update(input.accountXpub).digest('hex'),
   chainId:input.network==='BEP20'?56:null,
   signingVerified:false,enabled:false};
}
