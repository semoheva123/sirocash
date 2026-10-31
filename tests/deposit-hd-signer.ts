import assert from 'node:assert/strict';
import {HDKey} from '@scure/bip32';
import {Transaction,Interface} from 'ethers';
import {TronWeb,utils} from 'tronweb';
import {signDepositSweep,depositHdSigningConfiguration} from '../lib/deposit-hd-signer';
import {deriveTronDepositAddress} from '../lib/tron-addresses';
import {deriveBep20DepositAddress} from '../lib/evm-deposit-addresses';
import {treasuryDestination} from '../lib/treasury-addresses';
// PUBLIC deterministic fixture only. No owner xpub/xprv or chat seed used. NEVER FUND.
const root=HDKey.fromMasterSeed(new Uint8Array(32).fill(9));
async function main(){
 const now=1700000000000;
 const tron=root.derive("m/44'/195'/0'"),bep=root.derive("m/44'/60'/0'");
 const base={index:3,maxAmountBaseUnits:100000000000000000000n,maxNetworkFeeBaseUnits:10000000000000000n};
 const ti={...base,network:'TRC20' as const,accountXprv:tron.privateExtendedKey,accountXpub:tron.publicExtendedKey,assignedAddress:deriveTronDepositAddress(tron.publicExtendedKey,3).address,transaction:{amountBaseUnits:20000000n,refBlockBytes:'1234',refBlockHash:'ab'.repeat(8),timestamp:now,expiration:now+60000,feeLimitSun:4000000}};
 const trc=await signDepositSweep(ti,now);assert.equal(trc.network,'TRC20');
 if('transaction' in trc){
  assert.ok(utils.transaction.txCheck(trc.transaction));
  assert.equal(utils.crypto.ecRecover(trc.txId,trc.transaction.signature[0]).toLowerCase(),TronWeb.address.toHex(ti.assignedAddress).toLowerCase());
  const data=(trc.transaction.raw_data.contract[0].parameter.value as {data:string}).data;
  assert.equal(data.slice(8,72).slice(-40),TronWeb.address.toHex(treasuryDestination('TRC20','operating')).slice(2).toLowerCase());
 }
 const bi={...base,network:'BEP20' as const,accountXprv:bep.privateExtendedKey,accountXpub:bep.publicExtendedKey,assignedAddress:deriveBep20DepositAddress(bep.publicExtendedKey,3).address,transaction:{amountBaseUnits:20000000000000000000n,nonce:2,gasLimit:100000n,gasPrice:1000000000n}};
 const evm=await signDepositSweep(bi);assert.equal(evm.network,'BEP20');
 if('serialized' in evm){
  const tx=Transaction.from(evm.serialized);assert.equal(tx.from,bi.assignedAddress);assert.equal(tx.chainId,56n);
  const abi=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
  assert.equal(abi.decodeFunctionData('transfer',tx.data)[0],treasuryDestination('BEP20','operating'));
  // Untrusted extra fields cannot override fixed destination.
  const poisoned=await signDepositSweep({...bi,transaction:{...bi.transaction,destination:bi.assignedAddress}} as typeof bi);
  assert.equal(poisoned.txId,evm.txId);
 }
 await assert.rejects(()=>signDepositSweep({...ti,assignedAddress:deriveTronDepositAddress(tron.publicExtendedKey,4).address},now),/ASSIGNMENT_MISMATCH/);
 await assert.rejects(()=>signDepositSweep({...ti,accountXpub:bep.publicExtendedKey},now),/ACCOUNT_MISMATCH/);
 await assert.rejects(()=>signDepositSweep({...ti,accountXprv:tron.publicExtendedKey},now),/PRIVATE_KEY_REQUIRED/);
 await assert.rejects(()=>signDepositSweep({...ti,index:0x80000000},now),/INVALID_ADDRESS_INDEX/);
 await assert.rejects(()=>signDepositSweep({...bi,transaction:{...bi.transaction,amountBaseUnits:base.maxAmountBaseUnits+1n}}));
 const old=process.env.SIRO_SIGNER_ENABLED;delete process.env.SIRO_SIGNER_ENABLED;
 assert.throws(()=>depositHdSigningConfiguration('TRC20'),/LIVE_SIGNING_DISABLED/);
 if(old!==undefined)process.env.SIRO_SIGNER_ENABLED=old;
 console.log('HD sweep signing: both networks, child/address match, recovered signatures, fixed operating recipients, key/amount gates passed. Offline only; no broadcasts.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
