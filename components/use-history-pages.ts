'use client';
import {useEffect,useRef,useState} from 'react';
import {clientRequest} from '@/lib/client-request';
import type {FinancialStatus} from './use-financial-status';
type Cursor={at:string;id:string}|null;
type Page=Partial<FinancialStatus>&{userId:string;next:Cursor};
export type HistoryFilters={q?:string;type?:string;from?:string;to?:string;network?:string};
/** Explicit navigation/search only, never polling. Loaded history never replaces balances or capabilities. */
export function useHistoryPages(status:FinancialStatus,scope:'activity'|'deposits'|'withdrawals'|'pending',filters:HistoryFilters={}){
 const filterKey=JSON.stringify(filters),pageKey=status.userId+'|'+scope+'|'+filterKey,filtered=scope==='pending'||Object.values(filters).some(Boolean);
 const [stored,setStored]=useState<{key:string;items:Page[]}>({key:pageKey,items:[]}),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const lock=useRef(false),request=useRef<AbortController|null>(null),epoch=useRef(0);
 const lastStatus=useRef(status);
 const pages=stored.key===pageKey?stored.items:[];
 const setPages=(update:Page[]|((pages:Page[])=>Page[]))=>setStored(previous=>({key:pageKey,items:typeof update==='function'?update(previous.key===pageKey?previous.items:[]):update}));
 const initial=(scope==='activity'||scope==='pending')?status.activity:scope==='deposits'?status.deposits:status.withdrawals??status.operations?.filter(o=>o.kind==='WITHDRAWAL');
 async function read(before:Cursor,generation:number){
  if(lock.current)return;lock.current=true;setBusy(true);setError(false);const controller=new AbortController();request.current=controller;
  try{
   const params=new URLSearchParams({scope});for(const [key,value] of Object.entries(filters))if(value)params.set(key,value);if(before)params.set('before',JSON.stringify(before));
   const response=await clientRequest('/api/financial/history?'+params,{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error();const page=await response.json() as Page,key=scope==='withdrawals'?'operations':scope==='pending'?'activity':scope;
   if(page.userId!==status.userId||!Array.isArray(page[key])||(page.next!==null&&(!page.next||typeof page.next.id!=='string'||!Number.isFinite(Date.parse(page.next.at)))))throw Error();
   if(generation===epoch.current)setPages(previous=>[...(!previous.length&&!filtered?[{userId:status.userId,next:null,[key]:initial??[],payouts:status.payouts} as Page]:previous),page]);
  }catch{if(generation===epoch.current)setError(true)}finally{if(generation===epoch.current){lock.current=false;setBusy(false)}}
 }
 useEffect(()=>{
  lastStatus.current=status;const generation=++epoch.current;request.current?.abort();lock.current=false;setPages([]);setBusy(false);setError(false);
  if(filtered)void read(null,generation);
  return()=>{epoch.current++;request.current?.abort()};
 },[status.userId,scope,filterKey]);
 useEffect(()=>{if(lastStatus.current===status)return;lastStatus.current=status;if(scope==='pending'){const generation=++epoch.current;request.current?.abort();lock.current=false;setPages([]);void read(null,generation);return}if(!filtered&&pages.length)setPages(previous=>{const [head,...tail]=previous,key=scope==='withdrawals'?'operations':scope,map=new Map((head[key]??[]).map(r=>[r.id,r]));for(const row of initial??[])map.set(row.id,row);return [{...head,[key]:[...map.values()]},...tail]})},[status]);
 async function load(){const tail=initial?.at(-1),before=pages.length?pages.at(-1)!.next:!filtered&&tail?{at:new Date(tail.createdAt).toISOString(),id:tail.id}:null;await read(before,epoch.current)}
 const merge=(key:'activity'|'operations'|'deposits'|'payouts',live:unknown[]=[])=>{
  const map=new Map<string,unknown>();for(const page of pages)for(const row of page[key]??[])map.set(row.id,row);
  if(!filtered)for(const row of live as {id:string}[])map.set(row.id,row);
  return ([...map.values()] as {id:string;createdAt:string}[]).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.id.localeCompare(a.id)) as never;
 };
 const combined:FinancialStatus={...status,activity:(scope==='activity'||scope==='pending')?merge('activity',status.activity):status.activity,deposits:scope==='deposits'?merge('deposits',status.deposits):status.deposits,operations:scope==='withdrawals'?merge('operations',initial):status.operations,payouts:scope==='withdrawals'?merge('payouts',status.payouts):status.payouts};
 if(scope==='withdrawals')combined.withdrawals=combined.operations;
 return {combined,load,busy,error,started:pages.length>0,more:pages.length?pages.at(-1)?.next!==null:filtered?error:initial?.length===30};
}
