import {tronBandwidth} from './tron-bandwidth';
import 'server-only';
import {randomUUID} from 'node:crypto';
import {Transaction,Interface,getAddress} from 'ethers';
import {TronWeb,utils} from 'tronweb';
import {chainJsonPost,type ChainHttpOptions} from './chain-http';
import {bep20UsdtContract} from './bep20-deposit-verification';
import {tronUsdtContract} from './tron-deposit-verification';
import type {SweepResources} from './sweep-dispatch';
const token=new Interface(['function transfer(address to,uint256 amount) returns (bool)','function balanceOf(address owner) view returns(uint256)']);
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('RESOURCE_RESPONSE');return v as Record<string,unknown>}
function quantity(v:unknown){if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][a-f0-9]*)$/i.test(v))throw new Error('RESOURCE_QUANTITY');return BigInt(v)}
function integer(v:unknown){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new Error('RESOURCE_INTEGER');return v}
/** Exact saved USDT simulation and live resources, no signing or spending. No customer receipts.
 * resourceCost must be the trusted durable rental charge, not a price estimate or browser input.
 */
export function createOutboxResourceObserver(options:{bep20:ChainHttpOptions;tron:ChainHttpOptions;tronGenesisId:string}){
 if(!/^0{16}[a-f0-9]{48}$/.test(options.tronGenesisId))throw new Error('RESOURCE_GENESIS');
 const bsc=chainJsonPost(options.bep20),tron=chainJsonPost(options.tron);
 async function rpc(method:string,params:unknown[],signal:AbortSignal){const id=randomUUID(),r=obj(await bsc('/',JSON.stringify({jsonrpc:'2.0',id,method,params}),signal));if(r.id!==id||r.jsonrpc!=='2.0'||Object.hasOwn(r,'error')||!Object.hasOwn(r,'result'))throw new Error('RESOURCE_RPC');return r.result}
 return async(input:{network:'TRC20'|'BEP20';txId:string;signedPayload:string;resourceCost:bigint;signal:AbortSignal}):Promise<SweepResources>=>{
  const observedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+25000).toISOString();
  if(typeof input.resourceCost!=='bigint'||input.resourceCost<0n||input.resourceCost>=10n**78n||input.signedPayload.length>131072||input.signal.aborted)throw new Error('RESOURCE_INPUT');
  try{
   if(input.network==='BEP20'){
    const t=Transaction.from(input.signedPayload),decoded=token.decodeFunctionData('transfer',t.data);
    if(!t.signature||!t.from||t.hash!==input.txId||t.chainId!==56n||t.type!==0||t.to!==getAddress(bep20UsdtContract)||t.value!==0n||decoded[1]<=0n||t.data!==token.encodeFunctionData('transfer',[decoded[0],decoded[1]])||input.resourceCost!==0n)throw new Error();
    if(await rpc('eth_chainId',[],input.signal)!=='0x38')throw new Error();
    const [nonce,native,balance,gas]=await Promise.all([
     rpc('eth_getTransactionCount',[t.from,'pending'],input.signal),rpc('eth_getBalance',[t.from,'pending'],input.signal),
     rpc('eth_call',[{to:bep20UsdtContract,data:token.encodeFunctionData('balanceOf',[t.from])},'pending'],input.signal),
     rpc('eth_estimateGas',[{from:t.from,to:t.to,value:'0x0',data:t.data},'pending'],input.signal),
    ]);
    const n=quantity(nonce);if(n>BigInt(Number.MAX_SAFE_INTEGER)||typeof balance!=='string'||!/^0x[a-f0-9]{64}$/i.test(balance))throw new Error();
    return {network:'BEP20',txId:input.txId,sender:t.from,observedAt,expiresAt,tokenBalance:BigInt(balance),nativeBalance:quantity(native),resourceCost:0n,pendingNonce:Number(n),estimatedGas:quantity(gas)};
   }
   if(input.network!=='TRC20')throw new Error();
   const t=JSON.parse(input.signedPayload);
   if(!utils.transaction.txCheck(t)||t.txID!==input.txId||t.signature?.length!==1||t.raw_data.contract.length!==1||t.raw_data.expiration<=Date.now())throw new Error();
   const c=t.raw_data.contract[0],v=c.parameter.value;
   if(c.type!=='TriggerSmartContract'||v.contract_address.toLowerCase()!==TronWeb.address.toHex(tronUsdtContract).toLowerCase()||!/^a9059cbb0{24}[a-f0-9]{104}$/.test(v.data)||(v.call_value??0)!==0||(v.call_token_value??0)!==0||(v.token_id??0)!==0||utils.crypto.ecRecover(t.txID,t.signature[0]).toLowerCase()!==v.owner_address.toLowerCase())throw new Error();
   const genesis=obj(await tron('/walletsolidity/getblockbynum',JSON.stringify({num:0}),input.signal));if(genesis.blockID!==options.tronGenesisId)throw new Error();
   const body={owner_address:v.owner_address,contract_address:v.contract_address,function_selector:'transfer(address,uint256)',parameter:v.data.slice(8),visible:false};
   const post=(path:string,p:unknown)=>tron(path,JSON.stringify(p),input.signal);
   const [accountRaw,resourcesRaw,estimateRaw,balanceRaw]=await Promise.all([
    post('/wallet/getaccount',{address:v.owner_address,visible:false}),post('/wallet/getaccountresource',{address:v.owner_address,visible:false}),
    post('/wallet/estimateenergy',body),post('/wallet/triggerconstantcontract',{owner_address:v.owner_address,contract_address:v.contract_address,function_selector:'balanceOf(address)',parameter:v.owner_address.slice(2).padStart(64,'0'),visible:false}),
   ]);
   const account=obj(accountRaw),r=obj(resourcesRaw),estimate=obj(estimateRaw),balance=obj(balanceRaw);
   if(account.address!==v.owner_address||obj(estimate.result).result!==true||obj(balance.result).result!==true||!Array.isArray(balance.constant_result)||balance.constant_result.length!==1||typeof balance.constant_result[0]!=='string'||! /^[a-f0-9]{64}$/i.test(balance.constant_result[0]))throw new Error();
   const available=(limit:unknown,used:unknown)=>Math.max(0,integer(limit??0)-integer(used??0));
   const bandwidth=tronBandwidth(r).available;
   if(!Number.isSafeInteger(bandwidth))throw new Error();
   const pb=utils.transaction.txJsonToPb(t);pb.addSignature(Buffer.from(t.signature[0],'hex'));
   return {network:'TRC20',txId:input.txId,sender:TronWeb.address.fromHex(v.owner_address),observedAt,expiresAt,tokenBalance:BigInt('0x'+balance.constant_result[0]),nativeBalance:BigInt(integer(account.balance??0)),resourceCost:input.resourceCost,accountActive:true,requiredEnergy:integer(estimate.energy_required),availableEnergy:available(r.EnergyLimit,r.EnergyUsed),requiredBandwidth:pb.serializeBinary().length+64,availableBandwidth:bandwidth};
  }catch{throw new Error('OUTBOX_RESOURCES_UNVERIFIED')}
 };
}
