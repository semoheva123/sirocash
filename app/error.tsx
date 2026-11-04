'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useRef,useState,useTransition} from 'react';
import {ShieldAlert,RotateCw} from 'lucide-react';
export default function ErrorPage({reset}:{reset:()=>void}){
 const router=useRouter(),[ar,setAr]=useState(true),[online,setOnline]=useState(true),[pending,startTransition]=useTransition(),last=useRef(0);
 useEffect(()=>{setAr(document.documentElement.lang!=='en');const changed=()=>setOnline(navigator.onLine);changed();window.addEventListener('online',changed);window.addEventListener('offline',changed);return()=>{window.removeEventListener('online',changed);window.removeEventListener('offline',changed)}},[]);
 const t=(a:string,e:string)=>ar?a:e;
 function retry(){if(!online||pending||Date.now()-last.current<2000)return;last.current=Date.now();startTransition(()=>{reset();router.refresh()})}
 return <main id="main-content" tabIndex={-1} className="atelier-route-state account-recovery" dir={ar?'rtl':'ltr'}><section className="atelier-state-card"><span className="feature-icon"><ShieldAlert size={27}/></span><h1>{t('تعذّر تحميل الصفحة حاليًا','This page could not be loaded')}</h1><p role="status">{!online?t('الاتصال بالإنترنت غير متاح. تحقّق من الاتصال ثم أعد المحاولة.','You are offline. Check your connection before retrying.'):t('تعذّر إكمال تحميل الصفحة. يمكنك إعادة المحاولة.','The page could not finish loading. You can retry.')}</p><div className="atelier-state-actions"><button className="button" onClick={retry} disabled={!online||pending} aria-busy={pending}><RotateCw size={16}/>{pending?t('جارٍ إعادة المحاولة…','Retrying…'):t('إعادة المحاولة','Retry')}</button><Link href="/support" className="button secondary">{t('المساعدة','Help')}</Link></div><p>{t('إذا كنت تنتظر نتيجة تحويل، راجع السجل قبل إعادة إرساله.','If a transfer result is uncertain, check history before resending.')}</p></section></main>;
}
