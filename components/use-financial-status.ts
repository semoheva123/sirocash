'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createFinancialStream,type SyncState} from '@/lib/financial-stream-client';
export type FinancialStatus={enabled:boolean;userId:string;capabilities?:{withdrawals:boolean;deposits:boolean};balance?:{posted:string;held:string};operations?:{id:string;kind:string;amount:string;feeAmount:string;state:string;createdAt:string}[];activity?:{id:string;amount:string;type:string;status:string;createdAt:string}[]};
export function useFinancialStatus(enabled=true,expectedUserId?:string){
 const [status,setStatus]=useState<FinancialStatus|null>(null),[sync,setSync]=useState<SyncState>('syncing'),[updatedAt,setUpdatedAt]=useState<number|null>(null);
 const controller=useRef<ReturnType<typeof createFinancialStream<FinancialStatus>>|null>(null);
 useEffect(()=>{
  setStatus(null);setUpdatedAt(null);setSync(enabled?'syncing':'paused');
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
 return {status,sync,updatedAt,refresh};
}
