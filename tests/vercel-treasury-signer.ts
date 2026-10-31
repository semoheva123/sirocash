import assert from 'node:assert/strict';
import {Wallet,Transaction,Interface} from 'ethers';
import {TronWeb,utils as tronUtils} from 'tronweb';
import {signBep20Usdt,signTrc20Usdt,vercelSignerConfiguration} from '../lib/vercel-treasury-signer';
// Public fixture keys only; NEVER fund these addresses.
const key='01'.repeat(32),other='02'.repeat(32);
async function main(){
 const expectedSender=new Wallet('0x'+key).address,destination=new Wallet('0x'+other).address;
 const policy={expectedSender,maxAmountBaseUnits:100000000000000000000n,maxNetworkFeeBaseUnits:10000000000000000n};
 const intent={destination,amountBaseUnits:15000000000000000000n,nonce:7,gasLimit:100000n,gasPrice:1000000000n};
 const signed=await signBep20Usdt(key,policy,intent),parsed=Transaction.from(signed.serialized);
 assert.equal(parsed.from,expectedSender);assert.equal(parsed.chainId,56n);assert.equal(parsed.value,0n);assert.equal(parsed.nonce,7);
 const abi=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
 const decoded=abi.decodeFunctionData('transfer',parsed.data);assert.equal(decoded[0],destination);assert.equal(decoded[1],intent.amountBaseUnits);
 assert.equal((await signBep20Usdt(key,policy,intent)).txId,signed.txId);
 await assert.rejects(()=>signBep20Usdt(key,{...policy,expectedSender:destination},intent));
 for(const changes of [{amountBaseUnits:0n},{amountBaseUnits:policy.maxAmountBaseUnits+1n},{nonce:-1},{gasPrice:policy.maxNetworkFeeBaseUnits},{destination:expectedSender}])await assert.rejects(()=>signBep20Usdt(key,policy,{...intent,...changes}));
 const tronSender=TronWeb.address.fromPrivateKey(key),tronTo=TronWeb.address.fromPrivateKey(other);assert.ok(tronSender&&tronTo);
 const tronPolicy={expectedSender:tronSender,maxAmountBaseUnits:20000000n,maxNetworkFeeBaseUnits:5000000n};
 const now=1700000000000;
 const tronIntent={destination:tronTo,amountBaseUnits:15000000n,refBlockBytes:'1234',refBlockHash:'ab'.repeat(8),timestamp:now,expiration:now+60000,feeLimitSun:4000000};
 const trc=signTrc20Usdt(key,tronPolicy,tronIntent,now);
 assert.ok(tronUtils.transaction.txCheck(trc.transaction));assert.equal(trc.transaction.signature.length,1);
 assert.equal(tronUtils.crypto.ecRecover(trc.txId,trc.transaction.signature[0]).toLowerCase(),TronWeb.address.toHex(tronSender).toLowerCase());
 assert.equal(signTrc20Usdt(key,tronPolicy,tronIntent,now).txId,trc.txId);
 for(const changes of [{amountBaseUnits:0n},{expiration:now-1},{feeLimitSun:6000000},{timestamp:now+1},{refBlockHash:'00'},{destination:tronSender}])assert.throws(()=>signTrc20Usdt(key,tronPolicy,{...tronIntent,...changes},now));
 assert.throws(()=>signTrc20Usdt(key,{...tronPolicy,expectedSender:tronTo},tronIntent,now));
 const prior=process.env.SIRO_SIGNER_ENABLED;delete process.env.SIRO_SIGNER_ENABLED;
 assert.throws(()=>vercelSignerConfiguration('TRC20'),/LIVE_SIGNING_DISABLED/);
 if(prior!==undefined)process.env.SIRO_SIGNER_ENABLED=prior;
 console.log('Offline Vercel signer: BSC chain56 USDT transfer/recovery, TRON protobuf/hash/signature, fee/amount/address limits, disabled loader passed. No RPC/broadcast/production secrets.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
