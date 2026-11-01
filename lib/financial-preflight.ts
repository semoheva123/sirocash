import {tronBandwidth} from './tron-bandwidth';
import 'server-only';
import {Interface,getAddress} from 'ethers';
import {TronWeb} from 'tronweb';
import {chainJsonPost,type ChainHttpOptions} from './chain-http';
import {financialBscRpc,rpcObject,rpcQuantity} from './financial-rpc';
import {bep20UsdtContract} from './bep20-deposit-verification';
import {tronUsdtContract} from './tron-deposit-verification';
const abi=new Interface(['function transfer(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)']);
export type PreparationInput={network:'TRC20'|'BEP20';sender:string;recipient:string;amount?:bigint;maxAmount:bigint;maxFee:bigint;signal:AbortSignal};
const uint=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new Error('PREFLIGHT_INTEGER');return v};
export function createFinancialPreflight(options:{bep20:ChainHttpOptions;tron:ChainHttpOptions;genesisId:string;tronReadOwner:string;estimateEnergy?:(sender:string,recipient:string,signal:AbortSignal)=>Promise<number>}){
 if(!/^0{16}[a-f0-9]{48}$/.test(options.genesisId)||!TronWeb.isAddress(options.tronReadOwner))throw new Error('PREFLIGHT_CONFIG');
 const rpc=financialBscRpc(options.bep20),post=chainJsonPost(options.tron);
 return async(i:PreparationInput)=>{
  if(i.maxAmount<=0n||i.maxFee<=0n||i.signal.aborted)throw new Error('PREFLIGHT_INPUT');
  if(i.network==='BEP20'){
   const from=getAddress(i.sender),to=getAddress(i.recipient);if(from===to)throw new Error('PREFLIGHT_SELF');
   if(await rpc('eth_chainId',[],i.signal)!=='0x38')throw new Error('PREFLIGHT_CHAIN');
   const [token,native,nonce,price]=await Promise.all([rpc('eth_call',[{to:bep20UsdtContract,data:abi.encodeFunctionData('balanceOf',[from])},'pending'],i.signal),rpc('eth_getBalance',[from,'pending'],i.signal),rpc('eth_getTransactionCount',[from,'pending'],i.signal),rpc('eth_gasPrice',[],i.signal)]);
   if(typeof token!=='string'||!/^0x[a-f0-9]{64}$/i.test(token))throw new Error('PREFLIGHT_TOKEN');
   const balance=BigInt(token),amount=i.amount??(balance<i.maxAmount?balance:i.maxAmount),n=rpcQuantity(nonce),gasPrice=rpcQuantity(price);
   if(amount<=0n||amount>balance||amount>i.maxAmount||n>BigInt(Number.MAX_SAFE_INTEGER)||gasPrice<=0n)throw new Error('PREFLIGHT_BALANCE');
   const estimated=rpcQuantity(await rpc('eth_estimateGas',[{from,to:bep20UsdtContract,value:'0x0',data:abi.encodeFunctionData('transfer',[to,amount])},'pending'],i.signal));
   const gasLimit=(estimated*120n+99n)/100n,fee=gasLimit*gasPrice;
   if(estimated<21000n||fee>i.maxFee)throw new Error('PREFLIGHT_FEE_CAP');
   return {network:'BEP20' as const,amount,nativeBalance:rpcQuantity(native),requiredNative:fee,transaction:{amountBaseUnits:amount,nonce:Number(n),gasLimit,gasPrice}};
  }
  if(i.network!=='TRC20'||!TronWeb.isAddress(i.sender)||!TronWeb.isAddress(i.recipient)||i.sender===i.recipient||i.maxFee>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('PREFLIGHT_TRON_INPUT');
  const read=(p:string,b:unknown)=>post(p,JSON.stringify(b),i.signal),sender=TronWeb.address.toHex(i.sender),contract=TronWeb.address.toHex(tronUsdtContract);
  if(rpcObject(await read('/walletsolidity/getblockbynum',{num:0})).blockID!==options.genesisId)throw new Error('PREFLIGHT_CHAIN');
  const balance=rpcObject(await read('/wallet/triggerconstantcontract',{owner_address:TronWeb.address.toHex(options.tronReadOwner),contract_address:contract,function_selector:'balanceOf(address)',parameter:sender.slice(2).padStart(64,'0'),visible:false}));
  if(rpcObject(balance.result).result!==true||!Array.isArray(balance.constant_result)||balance.constant_result.length!==1||typeof balance.constant_result[0]!=='string'||! /^[a-f0-9]{64}$/i.test(balance.constant_result[0]))throw new Error('PREFLIGHT_TOKEN');
  const tokenBalance=BigInt('0x'+balance.constant_result[0]),amount=i.amount??(tokenBalance<i.maxAmount?tokenBalance:i.maxAmount);
  if(amount<=0n||amount>tokenBalance||amount>i.maxAmount)throw new Error('PREFLIGHT_BALANCE');
  const r=rpcObject(await read('/wallet/getaccountresource',{address:sender,visible:false}));
  let requiredEnergy:number;
  try{const e=rpcObject(await read('/wallet/estimateenergy',{owner_address:sender,contract_address:contract,function_selector:'transfer(address,uint256)',parameter:TronWeb.address.toHex(i.recipient).slice(2).padStart(64,'0')+amount.toString(16).padStart(64,'0'),visible:false}));if(rpcObject(e.result).result!==true)throw new Error();requiredEnergy=uint(e.energy_required)}
  catch{if(!options.estimateEnergy)throw new Error('PREFLIGHT_ENERGY_UNAVAILABLE');requiredEnergy=await options.estimateEnergy(i.sender,i.recipient,i.signal)}
  if(!Number.isSafeInteger(requiredEnergy)||requiredEnergy<=0||requiredEnergy>10000000)throw new Error('PREFLIGHT_ENERGY_INVALID');
  const tip=rpcObject(await read('/wallet/getnowblock',{})),raw=rpcObject(rpcObject(tip.block_header).raw_data),height=uint(raw.number),timestamp=uint(raw.timestamp);
  if(typeof tip.blockID!=='string'||!new RegExp('^'+height.toString(16).padStart(16,'0')+'[a-f0-9]{48}$').test(tip.blockID)||timestamp>Date.now()||Date.now()-timestamp>15000)throw new Error('PREFLIGHT_STALE_TIP');
  return {network:'TRC20' as const,amount,requiredEnergy,availableEnergy:Math.max(0,uint(r.EnergyLimit??0)-uint(r.EnergyUsed??0)),availableDelegatedBandwidth:tronBandwidth(r).delegated,availableBandwidth:tronBandwidth(r).available,transaction:{amountBaseUnits:amount,refBlockBytes:height.toString(16).padStart(4,'0').slice(-4),refBlockHash:tip.blockID.slice(16,32),timestamp:Date.now(),expiration:Date.now()+60000,feeLimitSun:Number(i.maxFee)}};
 };
}
