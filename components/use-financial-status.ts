'use client';
import type {TransferPartiesData} from '@/lib/internal-transfer-receipt';
import {createContext,createElement,useContext,useCallback,useEffect,useRef,useState} from 'react';
import {createFinancialStream,type SyncState} from '@/lib/financial-stream-client';
export type FinancialStatus={enabled:boolean;readable?:boolean;userId:string;capabilities?:{transfers?:boolean;withdrawals:boolean;deposits:boolean};balance?:{posted:string;held:string};operations?:(TransferPartiesData & {id:string;kind:string;amount:string;feeAmount:string;network?:string;recipient?:string;grossTokens?:string;feeTokens?:string;netTokens?:string;state:string;createdAt:string})[];withdrawals?:NonNullable<FinancialStatus['operations']>;activity?:(TransferPartiesData & {id:string;amount:string;type:string;transferAmount?:string|null;transferFee?:string|null;totalDebit?:string|null;network?:string;searchText?:string;status:string;createdAt:string})[];deposits?:{id:string;network:string;txId:string;amountBaseUnits:string;sender?:string|null;recipient?:string;state:string;createdAt:string}[];addresses?:{network:string;address:string}[];payouts?:{id:string;operationId:string;network:string;sender?:string;recipient?:string;amountBaseUnits?:string;txId:string;state:string;createdAt:string}[]};
function useFinancialStatusSource(enabled=true,expectedUserId?:string,initialStatus?:FinancialStatus|null){
 const [status,setStatus]=useState<FinancialStatus|null>(()=>initialStatus && initialStatus.userId===expectedUserId?initialStatus:null),[sync,setSync]=useState<SyncState>('syncing'),[updatedAt,setUpdatedAt]=useState<number|null>(null);
 const controller=useRef<ReturnType<typeof createFinancialStream<FinancialStatus>>|null>(null);
 useEffect(()=>{
  setStatus(initialStatus && initialStatus.userId===expectedUserId?initialStatus:null);setUpdatedAt(null);setSync(enabled?'syncing':'paused');
  if(!enabled)return;
  const c=createFinancialStream<FinancialStatus>({active:()=>document.visibilityState!=='hidden'&&navigator.onLine,expectedUserId,
   open:()=>new EventSource('/api/financial/events'),
   data:d=>{setStatus(d);setUpdatedAt(Date.now())},state:s=>{setSync(s);if(s==='unauthenticated'){setStatus(null);setUpdatedAt(null)}},
  });controller.current=c;
  const changed=()=>{if(document.visibilityState==='hidden'||!navigator.onLine)c.pause();else c.wake()};
  document.addEventListener('visibilitychange',changed);window.addEventListener('online',changed);window.addEventListener('offline',changed);window.addEventListener('focus',changed);c.wake();
  return()=>{c.stop();controller.current=null;document.removeEventListener('visibilitychange',changed);window.removeEventListener('online',changed);window.removeEventListener('offline',changed);window.removeEventListener('focus',changed)};
 },[enabled,expectedUserId]);
 const refresh=useCallback(async()=>{await controller.current?.refresh()},[]);
 return {status:expectedUserId&&status?.userId!==expectedUserId?null:status,sync,updatedAt,refresh};
}

const FinancialContext=createContext<ReturnType<typeof useFinancialStatusSource>|null>(null);
/** One SSE subscription for the entire authenticated layout, preserved across client navigation. */
export function FinancialStatusProvider({children,userId,initialStatus}:{children:React.ReactNode;userId:string;initialStatus?:FinancialStatus|null}){
 const value=useFinancialStatusSource(true,userId,initialStatus);
 return createElement(FinancialContext.Provider,{value},children);
}
export function useFinancialStatus(enabled=true,expectedUserId?:string){
 const shared=useContext(FinancialContext);
 const own=useFinancialStatusSource(enabled&&!shared,expectedUserId);
 const value=shared??own;
 return {...value,status:!enabled||expectedUserId&&value.status?.userId!==expectedUserId?null:value.status};
}
