'use client';
import {NotificationBell} from './account-notifications';
import {useAccountLanguage} from './account-language';
import {ReceivingIdentityPanel} from './receiving-identity';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowDownLeft,ArrowUpRight,ArrowLeftRight,Eye,EyeOff,ShieldCheck,Wallet,Smartphone} from 'lucide-react';
import {AccountNavigation} from './account-navigation';
import {WalletActions} from './wallet-actions';
import {WalletTransactionFeed} from './wallet-transaction-feed';
import {SendRouteSheet} from './send-route-sheet';
import {FinancialEmpty} from './financial-ui';
import {FinancialSyncStatus} from './financial-sync-status';
import {useFinancialStatus} from './use-financial-status';
import {displayAvailableBalance} from '@/lib/account-overview';
export function useWalletLanguage(){
 const [ar]=useAccountLanguage();
 useEffect(()=>{document.documentElement.lang=ar?'ar':'en';document.documentElement.dir=ar?'rtl':'ltr'},[ar]);
 return ar;
}
/** Authenticated presentation only. The layout owns the single owner-bound SSE. */
export function MobileWallet({ownerId,view='home'}:{ownerId:string;view?:'home'|'wallet'|'activity'|'exchange'|'commands'}){
 const ar=useWalletLanguage(),t=(a:string,e:string)=>ar?a:e;
 const {status,sync,updatedAt,refresh}=useFinancialStatus(true,ownerId);
 const [hidden,setHidden]=useState(false),[sendOpen,setSendOpen]=useState(false);
 const owned=status?.userId===ownerId?status:null;
 const active=view==='home'?'/dashboard':view==='activity'?'/activity':view==='commands'?'/payments':'/wallet';
 return <div className="site-shell account-workspace mobile-wallet"><AccountNavigation active={active} ar={ar}/>
  <main id="main-content" className="mobile-wallet-main" dir={ar?'rtl':'ltr'}>
   <header className="mobile-wallet-header"><Link prefetch={false} className="mobile-avatar" href="/settings#profile" aria-label={t('الملف الشخصي','Profile')}>SC</Link><div><small>SIRO CASH</small><h1>{view==='home'?t('مرحبًا بك في Siro Cash','Welcome to Siro Cash'):view==='wallet'?t('المحفظة','Wallet'):view==='activity'?t('النشاط','Activity'):view==='commands'?t('الطلبات المالية','Financial requests'):t('تبديل العملات','Exchange')}</h1></div><NotificationBell/></header>
   <FinancialSyncStatus hasData={!!status} compact sync={sync} updatedAt={updatedAt} ar={ar} retry={()=>void refresh().catch(()=>{})}/>
   {(view==='home'||view==='wallet')&&<>
    <div className="wallet-overview-card"><section className="mobile-balance" aria-label={t('إجمالي الرصيد','Total balance')}><span>{t('إجمالي الرصيد','Total balance')}</span><div className="mobile-balance-value"><strong dir="ltr">{hidden?'••••••':displayAvailableBalance(owned,ownerId)} <small>USD</small></strong><button type="button" className="mobile-icon-button" onClick={()=>setHidden(value=>!value)} aria-pressed={hidden} aria-label={hidden?t('إظهار الرصيد','Show balance'):t('إخفاء الرصيد','Hide balance')}>{hidden?<Eye size={20}/>:<EyeOff size={20}/>}</button></div><div className="mobile-currencies"><span>₮ USDT</span><span>USDC <small>{t('قريبًا','Soon')}</small></span></div></section>
    <div className="wallet-primary-funding"><Link prefetch={false} href="/deposit"><ArrowDownLeft size={23}/><span>{t('إيداع','Deposit')}</span></Link><Link prefetch={false} href="/withdraw"><ArrowUpRight size={23}/><span>{t('سحب','Withdraw')}</span></Link></div></div>
    <WalletActions ar={ar} ownerId={ownerId} status={owned} current={sync==='current'} mobileWallet onSend={()=>setSendOpen(true)}/>
   </>}
   {view==='home'&&<section className="mobile-recent"><div className="mobile-section-title"><h2>{t('آخر العمليات','Recent transactions')}</h2><Link prefetch={false} href="/activity">{t('عرض الكل','View all')}</Link></div>{owned?<WalletTransactionFeed status={owned} ar={ar} compact/>:<FinancialEmpty title={t('جارٍ تحميل العمليات…','Loading transactions…')}/>}</section>}
   {view==='wallet'&&<ReceivingIdentityPanel ownerId={ownerId} ar={ar}/>}
   {view==='wallet'&&<section className="wallet-service-grid"><h2>{t('خدمات المحفظة','Wallet services')}</h2><Link prefetch={false} href="/deposit"><ArrowDownLeft size={20}/>{t('إيداع العملات الرقمية','Crypto deposit')}</Link><Link prefetch={false} href="/withdraw"><ArrowUpRight size={20}/>{t('سحب USDT','Withdraw USDT')}</Link><Link prefetch={false} href="/sham-cash"><Wallet size={20}/>{t('شام كاش','Sham Cash')}</Link><Link prefetch={false} href="/mobile-topup"><Smartphone size={20}/>{t('شحن الهاتف','Mobile top-up')}</Link></section>}
   {(view==='activity'||view==='commands')&&(owned?<WalletTransactionFeed status={owned} ar={ar} initialFilter={view==='commands'?'pending':'all'}/>:<FinancialEmpty title={t('جارٍ تحميل النشاط…','Loading activity…')}/>)}
   {view==='exchange'&&<section className="mobile-unavailable"><ArrowLeftRight size={32}/><h2>{t('التبديل سيتوفر قريبًا','Exchange is coming soon')}</h2><p>{t('خدمة تبديل العملات غير مفعّلة حاليًا. لم تُنشأ أسعار أو طلبات تبديل.','Currency exchange is not activated. No exchange quotes or orders have been created.')}</p><Link prefetch={false} className="button secondary" href="/wallet">{t('العودة إلى المحفظة','Back to wallet')}</Link></section>}
   <div className="mobile-security-note"><ShieldCheck size={14}/>{t('تأكيد المدفوعات عبر جهازك','Payments approved with your device')}</div>
  </main>
  {sendOpen&&<SendRouteSheet ar={ar} onClose={()=>setSendOpen(false)}/>}
 </div>;
}
