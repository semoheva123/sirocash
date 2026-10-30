import type {CryptoAsset,CryptoNetwork} from './crypto-assets';
import { randomUUID, timingSafeEqual } from 'node:crypto';
export type DemoTransaction = { id: string; name: string; type: 'P2P'|'DEPOSIT'|'WITHDRAWAL'|'SHAM_CASH'|'MOBILE_TOPUP'; amount: number; status: string; createdAt: string; txid?: string;asset?:CryptoAsset;chain?:CryptoNetwork };
type Store={balanceCents:number;transactions:DemoTransaction[];entries:{transactionId:string;account:string;deltaCents:number}[];withdrawnCents:number;day:string};
const globalStore=globalThis as unknown as {siroDemo?:Store};
export const store:Store=globalStore.siroDemo??={balanceCents:245075,transactions:[{id:'SC-892401',name:'Omar Hassan',type:'P2P',amount:-120,status:'COMPLETED',createdAt:'2026-10-30T10:42:00Z'},{id:'SC-892398',name:'USDT · TRC-20',type:'DEPOSIT',amount:500,status:'COMPLETED',createdAt:'2026-10-30T09:15:00Z'},{id:'SC-892354',name:'Nour Café',type:'P2P',amount:-18.5,status:'COMPLETED',createdAt:'2026-10-29T16:32:00Z'}],entries:[],withdrawnCents:0,day:new Date().toISOString().slice(0,10)};
export function verifyDemoPin(pin:string){return /^\d{6}$/.test(pin)&&timingSafeEqual(Buffer.from(pin),Buffer.from('123456'))}
// Synchronous demo mutation. Production must use SERIALIZABLE transactions + row locks.
export function debit(amount:number,name:string,type:'P2P'|'WITHDRAWAL'|'SHAM_CASH'|'MOBILE_TOPUP',crypto?:{asset:CryptoAsset;chain:CryptoNetwork}){
 const cents=Math.round(amount*100);if(cents>store.balanceCents)throw Error('Insufficient balance.');
 const today=new Date().toISOString().slice(0,10);if(store.day!==today){store.day=today;store.withdrawnCents=0}
 if(type==='WITHDRAWAL'&&store.withdrawnCents+cents>100000)throw Error('Daily withdrawal limit of $1,000 exceeded.');
 const id=randomUUID();const transaction:DemoTransaction={id,name,type,...crypto,amount:-cents/100,status:type==='P2P'?'COMPLETED':type==='WITHDRAWAL'?'PENDING':'SIMULATED',createdAt:new Date().toISOString()};
 store.entries.push({transactionId:id,account:'SC-8901',deltaCents:-cents},{transactionId:id,account:type==='P2P'?name:type==='WITHDRAWAL'?'withdrawal-clearing':`${type}-demo-clearing`,deltaCents:cents});
 store.balanceCents-=cents;if(type==='WITHDRAWAL')store.withdrawnCents+=cents;store.transactions.unshift(transaction);
 return {transaction,balance:store.balanceCents/100,demo:true};
}
