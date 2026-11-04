'use client';
import Link from 'next/link';
import {ArrowDownLeft,ArrowUpRight,ArrowLeftRight,ArrowUpLeft,ShieldCheck,Smartphone,LifeBuoy} from 'lucide-react';
import type {FinancialStatus} from './use-financial-status';
/** Presentation of server capabilities only. Never an authorization or a second data source. */
export function WalletWorkspace({status,ownerId,current,ar}:{status:FinancialStatus|null;ownerId:string;current:boolean;ar:boolean}){
 const t=(a:string,e:string)=>ar?a:e,owned=status?.userId===ownerId?status:null;
 const known=current&&owned?.enabled===true&&Boolean(owned.capabilities);
 const rails=[{key:'transfers' as const,href:'/send',icon:ArrowLeftRight,label:t('التحويل الداخلي','Internal transfer')},{key:'deposits' as const,href:'/deposit',icon:ArrowDownLeft,label:t('إيداع العملات الرقمية','Crypto deposits')},{key:'withdrawals' as const,href:'/withdraw',icon:ArrowUpRight,label:t('سحب العملات الرقمية','Crypto withdrawals')}];
 return <aside className="wallet-workspace" aria-label={t('أدوات المحفظة','Wallet tools')}>
  <section className="wallet-availability"><div className="wallet-panel-heading"><span className="wallet-eyebrow">SIROCASH / SERVICES</span><h2>{t('خدمات حسابك','Your account services')}</h2></div><ul>{rails.map(item=>{const state=!known||typeof owned?.capabilities?.[item.key]!=='boolean'?'unknown':owned.capabilities[item.key]?'available':'unavailable';return <li key={item.key}><Link prefetch={false} href={item.href}><span className="wallet-tool-icon"><item.icon size={19}/></span><strong>{item.label}</strong><span className="wallet-service-state" data-state={state}><i aria-hidden="true"/>{state==='available'?t('متاحة','Available'):state==='unavailable'?t('غير متاحة','Unavailable'):t('بانتظار التحديث','Awaiting refresh')}</span></Link></li>})}</ul></section>
  <nav className="wallet-tool-links" aria-label={t('إدارة الحساب','Manage account')}>{[{href:'/settings#active-sessions',icon:ShieldCheck,title:t('الأمان والأجهزة','Security & devices'),detail:t('الجلسات والنشاط الأمني','Sessions & security activity')},{href:'/settings#app',icon:Smartphone,title:t('تطبيقك، أينما كنت','Your wallet, on the go'),detail:t('التثبيت وإشعارات الجهاز','Installation & device alerts')},{href:'/settings/support',icon:LifeBuoy,title:t('نحن هنا للمساعدة','Here to help'),detail:t('طلباتك ومحادثات الدعم','Your support conversations')}].map(item=><Link prefetch={false} key={item.href} href={item.href}><span className="wallet-tool-icon"><item.icon size={20}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpLeft className="wallet-tool-arrow" size={16} aria-hidden="true"/></Link>)}</nav>
 </aside>;
}
