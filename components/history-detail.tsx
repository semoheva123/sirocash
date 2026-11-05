'use client';
import {useEffect,useState} from 'react';
import {clientRequest} from '@/lib/client-request';
import {TransactionDocument} from './transaction-document';
import type {FinancialStatus} from './use-financial-status';
export function HistoryDetail({scope,id,ownerId,ar}:{scope:'activity'|'deposits'|'withdrawals'|'operation';id:string;ownerId:string;ar:boolean}){
 const [requestKey,setRequestKey]=useState('');
 const [data,setData]=useState<FinancialStatus|null>(null),[failed,setFailed]=useState(false),[version,setVersion]=useState(0),[resolved,setResolved]=useState(scope);
 useEffect(()=>{
  const controller=new AbortController();let live=true;setRequestKey(`${ownerId}|${scope}|${id}|${version}`);setData(null);setFailed(false);
  async function read(scope:string,id:string){const response=await clientRequest('/api/financial/history?'+new URLSearchParams({scope,id}),{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error();const body=await response.json();if(body.userId!==ownerId)throw Error();return body}
  void(async()=>{
   let body=await read(scope,id),kind=scope;
   if(kind==='operation'){if(!body.resolved)throw Error();kind=body.resolved.scope;body=await read(kind,body.resolved.id)}
   const row=body.activity?.[0];if(kind==='activity'&&row?.relatedId&&['DEPOSIT','WITHDRAWAL'].includes(row.type)){kind=row.type==='DEPOSIT'?'deposits':'withdrawals';body=await read(kind,row.relatedId)}
   if(!(body.activity?.length||body.deposits?.length||body.operations?.length))throw Error();
   if(live){setResolved(kind);setData(body)}
  })().catch(()=>{if(live)setFailed(true)});
  return()=>{live=false;controller.abort()};
 },[scope,id,ownerId,version]);
 const t=(a:string,e:string)=>ar?a:e;
 if(requestKey!==`${ownerId}|${scope}|${id}|${version}`)return <div className="transaction-loading" role="status"><span className="loading-block"/><span className="loading-block"/><p>{t('جارٍ تحميل تفاصيل المعاملة…','Loading transaction details…')}</p></div>;
 if(failed)return <div role="alert"><p>{t('تعذّر تحميل المعاملة، أو أنها غير متاحة لهذا الحساب.','Transaction could not load or is unavailable to this account.')}</p><button className="button secondary" onClick={()=>setVersion(v=>v+1)}>{t('إعادة المحاولة','Retry')}</button></div>;
 if(!data)return <div className="transaction-loading" role="status"><span className="loading-block"/><span className="loading-block"/><p>{t('جارٍ تحميل تفاصيل المعاملة…','Loading transaction details…')}</p></div>;
 if(resolved==='operation')return null;
 return <TransactionDocument data={data} scope={resolved} ar={ar}/>;
}
