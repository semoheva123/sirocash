import 'server-only';
import {Wallet,Interface,getAddress,Transaction} from 'ethers';
import {TronWeb,utils as tronUtils} from 'tronweb';
import {treasuryAddresses} from './treasury-addresses';
import {tronUsdtContract} from './tron-deposit-verification';

const evmUsdt='0x55d398326f99059fF775485246999027B3197955';
const tronUsdt=tronUsdtContract;
const token=new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
type Policy={expectedSender:string;maxAmountBaseUnits:bigint;maxNetworkFeeBaseUnits:bigint};
type EvmIntent={destination:string;amountBaseUnits:bigint;nonce:number;gasLimit:bigint;gasPrice:bigint};
type TronIntent={destination:string;amountBaseUnits:bigint;refBlockBytes:string;refBlockHash:string;timestamp:number;expiration:number;feeLimitSun:number};
function amount(value:bigint,policy:Policy){
 if(typeof value!=='bigint'||value<=0n||value>policy.maxAmountBaseUnits||value>=2n**256n)throw new Error('SIGNER_AMOUNT_POLICY');
 if(policy.maxAmountBaseUnits<=0n||policy.maxNetworkFeeBaseUnits<=0n)throw new Error('SIGNER_LIMITS_REQUIRED');
}
function privateKey(value:string){if(typeof value!=='string'||! /^(0x)?[0-9a-fA-F]{64}$/.test(value))throw new Error('SIGNER_KEY_UNAVAILABLE');return value.replace(/^0x/,'')}
/** LOCAL SIGNING ONLY. Caller must atomically consume durable approval/reservation and claim nonce first.
 * Construct calldata here; never accept arbitrary transactions, contracts, approvals or native sends.
 * The signed bytes MUST be durably saved before broadcast. Never return them to the browser.
 */
export async function signBep20Usdt(key:string,policy:Policy,intent:EvmIntent){
 amount(intent.amountBaseUnits,policy);
 const wallet=new Wallet('0x'+privateKey(key));
 if(getAddress(policy.expectedSender)!==wallet.address)throw new Error('SIGNER_OWNERSHIP_MISMATCH');
 const destination=getAddress(intent.destination);
 if(destination===wallet.address||destination==='0x0000000000000000000000000000000000000000')throw new Error('SIGNER_DESTINATION_POLICY');
 if(!Number.isSafeInteger(intent.nonce)||intent.nonce<0||typeof intent.gasLimit!=='bigint'||typeof intent.gasPrice!=='bigint'||intent.gasLimit<21000n||intent.gasPrice<=0n||intent.gasLimit*intent.gasPrice>policy.maxNetworkFeeBaseUnits)throw new Error('SIGNER_NETWORK_FEE_POLICY');
 const serialized=await wallet.signTransaction({type:0,chainId:56,nonce:intent.nonce,to:evmUsdt,value:0n,gasLimit:intent.gasLimit,gasPrice:intent.gasPrice,data:token.encodeFunctionData('transfer',[destination,intent.amountBaseUnits])});
 const parsed=Transaction.from(serialized);
 if(!parsed.hash)throw new Error('SIGNER_TRANSACTION_FAILED');
 return {network:'BEP20' as const,txId:parsed.hash,serialized};
}
export function signTrc20Usdt(key:string,policy:Policy,intent:TronIntent,now=Date.now()){
 amount(intent.amountBaseUnits,policy);
 const secret=privateKey(key);
 const sender=TronWeb.address.fromPrivateKey(secret);
 if(!sender||sender!==policy.expectedSender)throw new Error('SIGNER_OWNERSHIP_MISMATCH');
 if(!TronWeb.isAddress(intent.destination)||intent.destination===sender||intent.destination==='T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')throw new Error('SIGNER_DESTINATION_POLICY');
 if(!/^[a-f0-9]{4}$/.test(intent.refBlockBytes)||! /^[a-f0-9]{16}$/.test(intent.refBlockHash)||
 !Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(intent.timestamp)||intent.timestamp<0||!Number.isSafeInteger(intent.expiration)||
 intent.timestamp>now||now-intent.timestamp>30000||intent.expiration-now<15000||intent.expiration-intent.timestamp>60000)throw new Error('SIGNER_TRON_BLOCK_OR_EXPIRATION');
 if(!Number.isSafeInteger(intent.feeLimitSun)||intent.feeLimitSun<=0||BigInt(intent.feeLimitSun)>policy.maxNetworkFeeBaseUnits)throw new Error('SIGNER_NETWORK_FEE_POLICY');
 const toHex=TronWeb.address.toHex(intent.destination).slice(2);
 const data='a9059cbb'+toHex.padStart(64,'0')+intent.amountBaseUnits.toString(16).padStart(64,'0');
 const raw_data={contract:[{type:'TriggerSmartContract',parameter:{type_url:'type.googleapis.com/protocol.TriggerSmartContract',value:{owner_address:TronWeb.address.toHex(sender),contract_address:TronWeb.address.toHex(tronUsdt),data,call_value:0}}}],ref_block_bytes:intent.refBlockBytes,ref_block_hash:intent.refBlockHash,timestamp:intent.timestamp,expiration:intent.expiration,fee_limit:intent.feeLimitSun};
 const draft={visible:false,raw_data};
 const pb=tronUtils.transaction.txJsonToPb(draft);
 const txID=tronUtils.transaction.txPbToTxID(pb).replace(/^0x/,'').toLowerCase();
 const raw_data_hex=tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase();
 const transaction={...draft,txID,raw_data_hex};
 if(!tronUtils.transaction.txCheck(transaction))throw new Error('SIGNER_TRON_SERIALIZATION');
 const signed=tronUtils.crypto.signTransaction(secret,transaction);
 return {network:'TRC20' as const,txId:txID,transaction:signed};
}

/** Disabled by default. No public route uses this loader. Never set keys for Preview deployments.
 * This gate is NOT a replacement for durable device approval, policy/nonce claims or DB permissions.
 */
export function vercelSignerConfiguration(network:'TRC20'|'BEP20'){
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_SIGNER_ENABLED!=='true')throw new Error('LIVE_SIGNING_DISABLED');
 if(network!=='TRC20'&&network!=='BEP20')throw new Error('SIGNER_NETWORK_NOT_SUPPORTED');
 const key=process.env[`SIRO_${network}_OPERATING_PRIVATE_KEY`];
 const maxAmount=process.env[`SIRO_${network}_MAX_TOKEN_BASE_UNITS`];
 const maxFee=process.env[`SIRO_${network}_MAX_FEE_BASE_UNITS`];
 if(!key||!maxAmount||!maxFee||! /^[1-9]\d{0,77}$/.test(maxAmount)||! /^[1-9]\d{0,30}$/.test(maxFee))throw new Error('SIGNER_CONFIGURATION_MISSING');
 privateKey(key);
 return {key,policy:{expectedSender:treasuryAddresses[network].operating,maxAmountBaseUnits:BigInt(maxAmount),maxNetworkFeeBaseUnits:BigInt(maxFee)}};
}
