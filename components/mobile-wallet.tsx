'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowDownLeft,ArrowUpRight,ArrowLeftRight,Bell,Eye,EyeOff,ShieldCheck,Wallet} from 'lucide-react';
import {AccountNavigation} from './account-navigation';
import {WalletActions} from './wallet-actions';
import {FinancialActivity} from './financial-activity';
import {FinancialDate,FinancialEmpty,FinancialState,financialKind} from './financial-ui';
import {FinancialSyncStatus} from './financial-sync-status';
import {useFinancialStatus} from './use-financial-status';
import {displayAvailableBalance} from '@/lib/account-overview';
export function useWalletLanguage(){
 const [ar,setAr]=useState(true);
 useEffect(()=>{setAr(localStorage.getItem('siro-language')!=='en')},[]);
 useEffect(()=>{document.documentElement.lang=ar?'ar':'en';document.documentElement.dir=ar?'rtl':'ltr'},[ar]);
 return ar;
}
/** Authenticated presentation only. The layout owns the single owner-bound SSE. */
export function MobileWallet({ownerId,view='home'}:{ownerId:string;view?:'home'|'wallet'|'activity'|'exchange'}){
 const ar=useWalletLanguage(),t=(a:string,e:string)=>ar?a:e;
 const {status,sync,updatedAt,refresh}=useFinancialStatus(true,ownerId);
 const [hidden,setHidden]=useState(true);
 const owned=status?.userId===ownerId?status:null;
 const active=view==='home'?'/dashboard':view==='activity'?'/activity':'/wallet';
 const rows=owned?.activity?.slice(0,6)??[];
 return <div className="site-shell account-workspace mobile-wallet"><AccountNavigation active={active} ar={ar}/>
  <main id="main-content" className="mobile-wallet-main" dir={ar?'rtl':'ltr'}>
   <header className="mobile-wallet-header"><Link className="mobile-avatar" href="/settings#profile" aria-label={t('الملف الشخصي','Profile')}>SC</Link><div><small>SIRO CASH</small><h1>{view==='home'?t('مرحبًا بك في Siro Cash','Welcome to Siro Cash'):view==='wallet'?t('المحفظة','Wallet'):view==='activity'?t('النشاط','Activity'):t('تبديل العملات','Exchange')}</h1></div><Link className="mobile-icon-button" href="/settings#active-sessions" aria-label={t('تنبيهات ونشاط الأمان','Security notifications and activity')}><Bell size={21}/></Link></header>
   <FinancialSyncStatus compact sync={sync} updatedAt={updatedAt} ar={ar} retry={()=>void refresh().catch(()=>{})}/>
   {(view==='home'||view==='wallet')&&<>
    <section className="mobile-balance" aria-label={t('إجمالي الرصيد','Total balance')}><span>{t('إجمالي الرصيد','Total balance')}</span><div className="mobile-balance-value"><strong dir="ltr">{hidden?'••••••':displayAvailableBalance(owned,ownerId)} <small>USD</small></strong><button type="button" className="mobile-icon-button" onClick={()=>setHidden(!hidden)} aria-pressed={!hidden} aria-label={hidden?t('إظهار الرصيد','Show balance'):t('إخفاء الرصيد','Hide balance')}>{hidden?<Eye size={20}/>:<EyeOff size={20}/>}</button></div><div className="mobile-currencies"><span>₮ USDT</span><span>USDC <small>{t('قريبًا','Soon')}</small></span></div></section>
    <WalletActions ar={ar} ownerId={ownerId} status={owned} current={sync==='current'} mobileWallet/>
   </>}
   {view==='home'&&<section className="mobile-recent"><div className="mobile-section-title"><h2>{t('آخر العمليات','Recent transactions')}</h2><Link href="/activity">{t('عرض الكل','View all')}</Link></div>{rows.length?<ul>{rows.map(row=><li key={row.id}><span className="mobile-transaction-icon">{row.type==='DEPOSIT'?<ArrowDownLeft size={20}/>:row.type==='WITHDRAWAL'?<ArrowUpRight size={20}/>:<ArrowLeftRight size={20}/>}</span><div><strong>{financialKind(row.type,ar)}</strong><FinancialDate value={row.createdAt} ar={ar}/><FinancialState state={row.status} ar={ar}/></div><strong className="mobile-transaction-amount" dir="ltr">{row.amount} <small>USD</small></strong></li>)}</ul>:<FinancialEmpty title={owned?t('لا توجد عمليات بعد','No transactions yet'):t('جارٍ تحميل العمليات…','Loading transactions…')}/>}</section>}
   {view==='wallet'&&<section className="mobile-menu"><h2>{t('خدمات المحفظة','Wallet services')}</h2><Link href="/deposit"><ArrowDownLeft size={20}/>{t('إيداع العملات الرقمية','Crypto deposit')}</Link><Link href="/withdraw"><ArrowUpRight size={20}/>{t('سحب USDT','Withdraw USDT')}</Link><Link href="/sham-cash"><Wallet size={20}/>{t('شام كاش','Sham Cash')}</Link><Link href="/mobile-topup">{t('شحن الهاتف','Mobile top-up')}</Link></section>}
   {view==='activity'&&(owned?<FinancialActivity status={owned} ar={ar} showBalance={false}/>:<FinancialEmpty title={t('جارٍ تحميل النشاط…','Loading activity…')}/>)}
   {view==='exchange'&&<section className="mobile-unavailable"><ArrowLeftRight size={32}/><h2>{t('التبديل سيتوفر قريبًا','Exchange is coming soon')}</h2><p>{t('خدمة تبديل العملات غير مفعّلة حاليًا. لم تُنشأ أسعار أو طلبات تبديل.','Currency exchange is not activated. No exchange quotes or orders have been created.')}</p><Link className="button secondary" href="/wallet">{t('العودة إلى المحفظة','Back to wallet')}</Link></section>}
   <div className="mobile-security-note"><ShieldCheck size={14}/>{t('تأكيد المدفوعات عبر جهازك','Payments approved with your device')}</div>
  </main>
 </div>;
}
