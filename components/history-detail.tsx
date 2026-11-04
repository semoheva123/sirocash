'use client';
import {useEffect,useState} from 'react';
import {clientRequest} from '@/lib/client-request';
import {FinancialRecords} from './financial-records';
import {FinancialDate,FinancialReference,FinancialState,financialKind} from './financial-ui';
import {TransferParties} from './transfer-parties';
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
   const row=body.activity?.[0];if(scope==='activity'&&row?.relatedId&&['DEPOSIT','WITHDRAWAL'].includes(row.type)){kind=row.type==='DEPOSIT'?'deposits':'withdrawals';body=await read(kind,row.relatedId)}
   if(!(body.activity?.length||body.deposits?.length||body.operations?.length))throw Error();
   if(live){setResolved(kind);setData(body)}
  })().catch(()=>{if(live)setFailed(true)});
  return()=>{live=false;controller.abort()};
 },[scope,id,ownerId,version]);
 const t=(a:string,e:string)=>ar?a:e;
 if(requestKey!==`${ownerId}|${scope}|${id}|${version}`)return <p role="status">{t('جارٍ تحميل تفاصيل المعاملة…','Loading transaction details…')}</p>;
 if(failed)return <div role="alert"><p>{t('تعذّر تحميل المعاملة، أو أنها غير متاحة لهذا الحساب.','Transaction could not load or is unavailable to this account.')}</p><button className="button secondary" onClick={()=>setVersion(v=>v+1)}>{t('إعادة المحاولة','Retry')}</button></div>;
 if(!data)return <p role="status">{t('جارٍ تحميل تفاصيل المعاملة…','Loading transaction details…')}</p>;
 if(resolved==='operation')return null;
 if(resolved!=='activity')return <FinancialRecords interactive={false} status={data} ar={ar} scope={resolved}/>;
 const row=data.activity![0];
 return <section className="card"><h2>{financialKind(row.type,ar)}</h2><p dir="ltr">{row.amount} USD</p><FinancialState state={row.status} ar={ar}/><FinancialDate value={row.createdAt} ar={ar}/><FinancialReference value={row.id} ar={ar}/>{row.type==='P2P'&&<TransferParties entry={row} ar={ar}/>}<a className="chain-explorer-link" href={'/settings/support?reference='+encodeURIComponent(row.id)}>{t('طلب مساعدة بشأن المعاملة','Get help with this transaction')}</a></section>;
}
