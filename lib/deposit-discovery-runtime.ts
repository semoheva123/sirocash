import 'server-only';
import {createDepositDiscovery} from './deposit-discovery';
import {productionBep20ReadRpc} from './bep20-rpc';
import {productionTronRead} from './tron-receipt-observer';
import type {WalletDb} from './wallet-engine';
export function productionDepositDiscovery(db:WalletDb,signal?:AbortSignal){
 const genesis=process.env.SIRO_TRON_GENESIS_ID,minimum=Number(process.env.SIRO_BEP20_MIN_CONFIRMATIONS??'15');
 const amount=(network:string)=>{const v=process.env[`SIRO_${network}_MAX_TOKEN_BASE_UNITS`];if(!v||! /^[1-9]\d{0,77}$/.test(v))throw Error('DISCOVERY_LIMIT_REQUIRED');return BigInt(v)};
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_DEPOSIT_DISCOVERY_ENABLED!=='true'||!genesis||!/^0{16}[a-f0-9]{48}$/.test(genesis)||!Number.isSafeInteger(minimum)||minimum<15||minimum>10000)throw Error('DISCOVERY_DISABLED_OR_UNCONFIGURED');
 const historicalStarts:Partial<Record<'TRC20'|'BEP20',number>>={};
 for(const network of ['TRC20','BEP20'] as const){const value=process.env[`SIRO_${network}_DEPOSIT_START_BLOCK`];if(value!==undefined){if(!/^\d{1,15}$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('DISCOVERY_INVALID_START');historicalStarts[network]=Number(value)}}
 return createDepositDiscovery(db,{enabled:true,historicalStarts,bep20:productionBep20ReadRpc(signal),tron:productionTronRead(signal),tronGenesisId:genesis,minimumBep20Confirmations:minimum,maxBep20Amount:amount('BEP20'),maxTronAmount:amount('TRC20')});
}
