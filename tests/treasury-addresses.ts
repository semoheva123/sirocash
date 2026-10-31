import assert from 'node:assert/strict';
import {keccak_256} from '@noble/hashes/sha3';
import {treasuryAddresses,treasuryDestination} from '../lib/treasury-addresses';
import {validTronAddress} from '../lib/tron-addresses';
for(const role of ['operating','reserve'] as const){
 if(role==='operating')assert.ok(validTronAddress(treasuryAddresses.TRC20[role]));
 else assert.equal(treasuryAddresses.TRC20[role],null);
 const address=treasuryAddresses.BEP20[role];
 assert.match(address,/^0x[a-fA-F0-9]{40}$/);
 // EIP-55 is evaluated locally; never silently repair a supplied address.
 const lower=address.slice(2).toLowerCase();
 const digest=Buffer.from(keccak_256(new TextEncoder().encode(lower))).toString('hex');
 const checksum='0x'+[...lower].map((c,i)=>parseInt(digest[i],16)>=8?c.toUpperCase():c).join('');
 assert.equal(address,checksum,'Supplied EVM address checksum mismatch');
}
assert.equal(treasuryDestination('TRC20','operating'),'TFMUACLuYyFcw9YzrAgESnQ9a6pvEiY1bL');
assert.equal(treasuryAddresses.BEP20.chainId,56);
for(const network of ['TRC20','BEP20'] as const){
 if(network==='BEP20')assert.notEqual(treasuryDestination(network,'operating'),treasuryDestination(network,'reserve'));
 else assert.throws(()=>treasuryDestination(network,'reserve'),/NOT_CONFIGURED/);
 assert.ok(Object.isFrozen(treasuryAddresses[network]));
}
assert.ok(Object.isFrozen(treasuryAddresses));
console.log('Treasury role mappings, TRON checksums, EIP-55 and BNB chain binding passed. No ownership or on-chain balance verification.');
