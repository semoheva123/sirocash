'use client';
import Link from 'next/link';
import {Fragment,useState} from 'react';
import {SendRouteSheet} from './send-route-sheet';
import {WorkspaceSearch} from './workspace-search';
import {ArrowDownLeft,ArrowUpRight,ArrowLeftRight,LayoutDashboard,Settings2,Smartphone,ShieldCheck,Wallet,LifeBuoy,History} from 'lucide-react';

/** One navigation model for every private page; logical CSS properties mirror it in RTL. */
export function AccountNavigation({active,ar}:{active:string;ar:boolean}){
 const [sendOpen,setSendOpen]=useState(false);
 const items=[
  {href:'/dashboard',icon:LayoutDashboard,en:'Home',ar:'الرئيسية'},
  {href:'/wallet',icon:Wallet,en:'Wallet',ar:'المحفظة'},
  {href:'/activity',icon:History,en:'Activity',ar:'النشاط'},
  {href:'/deposit',icon:ArrowDownLeft,en:'Deposit',ar:'الإيداع'},
  {href:'/withdraw',icon:ArrowUpRight,en:'Withdraw',ar:'السحب'},
  {href:'/payments',icon:ArrowLeftRight,en:'Financial commands',ar:'الطلبات المالية'},
  {href:'/sham-cash',icon:ArrowLeftRight,en:'Sham Cash',ar:'شام كاش'},
  {href:'/mobile-topup',icon:Smartphone,en:'Mobile top-up',ar:'شحن الهاتف'},
  {href:'/settings',icon:Settings2,en:'Settings',ar:'الإعدادات'},
 ];
 return <><aside className="account-rail">
  <Link prefetch={false} href="/dashboard" className="logo rail-logo"><span className="logo-mark"><ArrowLeftRight size={23}/></span><span>SiroCash<span className="logo-dot">.</span></span></Link>
  <div className="signature-rail-identity"><span>PERSONAL</span><i/><span>SIROCASH</span></div><span className="rail-caption">{ar?'مساحة الحساب':'YOUR WORKSPACE'}</span>
  <WorkspaceSearch ar={ar}/><nav aria-label={ar?'التنقّل الرئيسي للحساب':'Main account navigation'}>{items.map((item,index)=><Fragment key={item.href}>{[0,5,8].includes(index)&&<span className="premium-nav-group">{index===0?(ar?'المحفظة':'WALLET'):index===5?(ar?'الخدمات':'SERVICES'):(ar?'الحساب':'ACCOUNT')}</span>}<Link prefetch={false} href={item.href} aria-current={active===item.href?'page':undefined}><item.icon size={19}/><span>{ar?item.ar:item.en}</span><i/></Link></Fragment>)}</nav>
  <div className="rail-bottom"><Link prefetch={false} className="premium-rail-help" href="/support"><LifeBuoy size={18}/><span>{ar?'المساعدة والإرشادات':'Help & guidance'}</span><ArrowUpRight size={15}/></Link><div className="rail-security"><ShieldCheck size={22}/><strong>{ar?'الأمان في كل خطوة':'Security at every step'}</strong><p>{ar?'كلمة مرور ورمز بريد للتحقق من الدخول والتغييرات الحسّاسة.':'Password and email approval for sign-in and sensitive changes.'}</p><Link prefetch={false} href="/settings">{ar?'إعدادات الأمان':'Security settings'}<ArrowUpRight size={14}/></Link></div><span className="rail-environment"><Wallet size={14}/>{ar?'SIRO CASH · محفظتك':'SIRO CASH · Your wallet'}</span></div>
 </aside><nav className="pro-mobile-nav" aria-label={ar?'التنقّل السريع':'Quick navigation'}>{[{href:'/dashboard',icon:LayoutDashboard,en:'Home',ar:'الرئيسية'},{href:'/wallet',icon:Wallet,en:'Wallet',ar:'المحفظة'},{href:'/activity',icon:History,en:'Activity',ar:'النشاط'},{href:'/settings',icon:Settings2,en:'Settings',ar:'الإعدادات'}].map(item=><Link prefetch={false} key={item.href} href={item.href} aria-current={(active===item.href||(item.href==='/wallet'&&['/send','/payments','/deposit','/withdraw','/exchange','/sham-cash','/mobile-topup'].includes(active)))?'page':undefined}><item.icon size={20}/><span>{ar?item.ar:item.en}</span></Link>)}<button type="button" className="wallet-nav-send" onClick={()=>setSendOpen(true)} aria-label={ar?'إرسال الأموال':'Send money'}><ArrowUpRight size={25}/><span>{ar?'إرسال':'Send'}</span></button></nav>{sendOpen&&<SendRouteSheet ar={ar} onClose={()=>setSendOpen(false)}/>}</>;
}
