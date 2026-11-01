import {tronBandwidth} from './tron-bandwidth';
import 'server-only';
import {TronWeb} from 'tronweb';
import {chainJsonPost,type ChainHttpOptions} from './chain-http';
import {validTronAddress} from './tron-addresses';
export type EnergyDelivery={sender:string;delegationTxId:string;energyAmount:number;bandwidthAmount?:number;observedAt:string;expiresAt:string};
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v as Record<string,unknown>}
function num(v:unknown){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new Error();return v}
/** Native ENERGY delegation proof, solid inclusion and actual current receiver resources.
 * Unsupported contract/proxy delegation shapes remain HELD. A provider status is not proof.
 */
export function createEnergyDeliveryObserver(options:ChainHttpOptions&{genesisId:string}){
 if(!/^0{16}[a-f0-9]{48}$/.test(options.genesisId))throw new Error('ENERGY_GENESIS');
 const post=chainJsonPost(options);
 return async(input:{sender:string;delegationTxId:string;energyAmount:number;bandwidthAmount?:number;resourceType?:'ENERGY'|'BANDWIDTH';signal:AbortSignal}):Promise<EnergyDelivery>=>{
  if(!validTronAddress(input.sender)||! /^[a-f0-9]{64}$/.test(input.delegationTxId)||!Number.isSafeInteger(input.energyAmount)||input.energyAmount<0||!Number.isSafeInteger(input.bandwidthAmount??0)||(input.bandwidthAmount??0)<0)throw new Error('ENERGY_DELIVERY_INPUT');
  const observedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+25000).toISOString();
  try{
   const read=(path:string,body:unknown)=>post(path,JSON.stringify(body),input.signal);
   if(obj(await read('/walletsolidity/getblockbynum',{num:0})).blockID!==options.genesisId)throw new Error();
   const info=obj(await read('/walletsolidity/gettransactioninfobyid',{value:input.delegationTxId}));
   const height=num(info.blockNumber);if(info.id!==input.delegationTxId||(info.result!==undefined&&info.result!=='SUCESS'&&info.result!=='SUCCESS')||(info.receipt!==undefined&&obj(info.receipt).result!==undefined&&obj(info.receipt).result!=='SUCCESS'))throw new Error();
   const solid=obj(await read('/walletsolidity/getnowblock',{})),solidHeader=obj(obj(solid.block_header).raw_data);
   if(num(solidHeader.number)<height||Math.abs(Date.now()-num(solidHeader.timestamp))>120000)throw new Error();
   const block=obj(await read('/walletsolidity/getblockbynum',{num:height}));
   if(num(obj(obj(block.block_header).raw_data).number)!==height||typeof block.blockID!=='string'||!new RegExp('^'+height.toString(16).padStart(16,'0')+'[a-f0-9]{48}$').test(block.blockID)||!Array.isArray(block.transactions))throw new Error();
   const matches=block.transactions.filter(t=>obj(t).txID===input.delegationTxId);if(matches.length!==1)throw new Error();
   const tx=obj(matches[0]);if(!Array.isArray(tx.ret)||tx.ret.length!==1||obj(tx.ret[0]).contractRet!=='SUCCESS')throw new Error();
   const contracts=obj(tx.raw_data).contract;if(!Array.isArray(contracts)||contracts.length!==1)throw new Error();
   const c=obj(contracts[0]),value=obj(obj(c.parameter).value);
   if((input.resourceType!==undefined&&value.resource!==input.resourceType)||c.type!=='DelegateResourceContract'||(value.resource!=='ENERGY'&&!((input.bandwidthAmount??0)>0&&value.resource==='BANDWIDTH'))||value.receiver_address!==TronWeb.address.toHex(input.sender)||num(value.balance)<=0)throw new Error();
   const r=obj(await read('/wallet/getaccountresource',{address:TronWeb.address.toHex(input.sender),visible:false}));
   if(num(r.EnergyLimit??0)-num(r.EnergyUsed??0)<input.energyAmount||tronBandwidth(r).available<(input.bandwidthAmount??0))throw new Error();
   if(obj(await read('/walletsolidity/getblockbynum',{num:height})).blockID!==block.blockID||Date.now()>=Date.parse(expiresAt))throw new Error();
   return {sender:input.sender,delegationTxId:input.delegationTxId,energyAmount:input.energyAmount,bandwidthAmount:input.bandwidthAmount??0,observedAt,expiresAt};
  }catch{throw new Error('ENERGY_DELIVERY_UNPROVEN')}
 };
}
