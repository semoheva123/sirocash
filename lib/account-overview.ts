export type AccountIdentity={id:string;email:string;emailVerifiedAt:string};
type Query=(sql:string,values:string[])=>Promise<{rows:{balance:string}[]}>;
/** Only the persisted user's balance is shown; shared demonstration data is never merged. */
export async function accountOverview(user:AccountIdentity,query:Query){
 const {rows:[account]}=await query('SELECT balance FROM "User" WHERE id=$1',[user.id]);
 if(!account)throw Error('Account unavailable');
 if(!/^\d+(\.\d+)?$/.test(account.balance))throw Error('Invalid account balance');
 return {user,balance:account.balance,transactions:[],demo:false,financialServicesEnabled:false,historyAvailable:false};
}
export function displayAccountBalance(value:string){
 const [whole,fraction='']=value.split('.');
 return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(fraction+'00').slice(0,2);
}

/** Only a successful owner-bound ledger snapshot can establish zero; never use User.balance. */
export function displayLedgerBalance(status:{userId:string;balance?:{posted?:unknown}}|null|undefined,ownerId:string){
 const posted=status?.balance?.posted;
 return status?.userId===ownerId&&typeof posted==='string'&&/^\d+(\.\d+)?$/.test(posted)?displayAccountBalance(posted):'—';
}
