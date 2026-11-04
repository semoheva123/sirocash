import type {FinancialStatus} from '../components/use-financial-status';
export type WalletActivity=NonNullable<FinancialStatus['activity']>[number]&{currency?:string;network?:string;searchText?:string;recordScope?:'deposits'|'withdrawals'|'operation';recordId?:string};
/** Unposted observations/requests are shown as states, never counted as posted balance. */
export function walletActivity(status:FinancialStatus):WalletActivity[]{
 const rows:WalletActivity[]=(status.activity??[]).map(r=>({...r,currency:(r as WalletActivity).currency??'USD'}));
 const operations=new Map([...(status.operations??[]),...(status.withdrawals??[])].map(o=>[o.id,o]));
 for(const o of operations.values())if(o.state!=='COMPLETED'&&o.kind!=='DEPOSIT')rows.push({...o,type:o.kind==='TRANSFER'?'P2P':o.kind,status:o.state,amount:'-'+o.amount.replace(/^-/,''),currency:'USD',recordScope:o.kind==='WITHDRAWAL'?'withdrawals':undefined,recordId:o.id});
 for(const d of status.deposits??[])if(d.state!=='CREDITED'){
  const decimals=d.network==='TRC20'?6:d.network==='BEP20'?18:null;
  if(decimals===null||!/^\d{1,78}$/.test(d.amountBaseUnits))continue;
  const scale=10n**BigInt(decimals),value=BigInt(d.amountBaseUnits),fraction=String(value%scale).padStart(decimals,'0').replace(/0+$/,'');
  rows.push({id:d.id,createdAt:d.createdAt,type:'DEPOSIT',status:d.state,amount:`${value/scale}${fraction?'.'+fraction:''}`,currency:'USDT',recordScope:'deposits',recordId:d.id,network:d.network,searchText:[d.txId,d.sender,d.recipient].filter(Boolean).join(' ')});
 }
 const unique=new Map(rows.map(r=>[r.id,r]));
 for(const o of operations.values())if(o.state==='COMPLETED')unique.delete(o.id);
 for(const d of status.deposits??[])if(d.state==='CREDITED')unique.delete(d.id);
 return [...unique.values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.id.localeCompare(a.id));
}
