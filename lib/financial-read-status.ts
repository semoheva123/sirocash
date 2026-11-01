import type {WalletDb} from './wallet-engine';
import {readFinancialSnapshot} from './financial-status';
/** Authenticator supplies the owner; caller-controlled owner IDs never enter this read path. */
export async function readOwnerFinancialStatus(o:{authenticate:()=>Promise<{id:string}|null>;database:()=>WalletDb;enabled:()=>boolean;transfers?:()=>boolean;withdrawals:()=>boolean;deposits:()=>boolean}){
 const user=await o.authenticate();
 if(!user)return null;
 const data=await o.database().transaction(tx=>readFinancialSnapshot(tx,user.id));
 const enabled=o.enabled();
 return {enabled,readable:true as const,userId:user.id,capabilities:{...(o.transfers?{transfers:enabled&&o.transfers()}:{}),withdrawals:enabled&&o.withdrawals(),deposits:enabled&&o.deposits()},...data};
}
