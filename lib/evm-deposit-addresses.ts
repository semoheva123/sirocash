/** Watch-only BNB Smart Chain derivation; address format itself does not prove network. */
import {computeAddress,getAddress} from 'ethers';
import {tronAccountPublicKey} from './tron-addresses';
export function deriveBep20DepositAddress(accountXpub:string,index:number){
 if(!Number.isSafeInteger(index)||index<0||index>=0x80000000)throw new Error('INVALID_ADDRESS_INDEX');
 // Same BIP32 account validation, not a claim of TRON ancestry. Origin must be verified offline.
 const child=tronAccountPublicKey(accountXpub).deriveChild(0).deriveChild(index);
 if(!child.publicKey)throw new Error('PUBLIC_DERIVATION_FAILED');
 return {address:getAddress(computeAddress('0x'+Buffer.from(child.publicKey).toString('hex'))),relativePath:`0/${index}`};
}
