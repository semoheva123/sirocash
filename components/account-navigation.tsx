'use client';
import Link from 'next/link';
import {ArrowDownLeft,ArrowUpRight,ArrowLeftRight,LayoutDashboard,Settings2,Smartphone,ShieldCheck,Wallet} from 'lucide-react';

/** One navigation model for every private page; logical CSS properties mirror it in RTL. */
export function AccountNavigation({active,ar}:{active:string;ar:boolean}){
 const items=[
  {href:'/dashboard',icon:LayoutDashboard,en:'Overview',ar:'نظرة عامة'},
  {href:'/deposit',icon:ArrowDownLeft,en:'Deposit',ar:'الإيداع'},
  {href:'/withdraw',icon:ArrowUpRight,en:'Withdraw',ar:'السحب'},
  {href:'/sham-cash',icon:ArrowLeftRight,en:'Sham Cash',ar:'شام كاش'},
  {href:'/mobile-topup',icon:Smartphone,en:'Mobile top-up',ar:'شحن الهاتف'},
  {href:'/settings',icon:Settings2,en:'Settings',ar:'الإعدادات'},
 ];
 return <aside className="account-rail">
  <Link href="/dashboard" className="logo rail-logo"><span className="logo-mark"><ArrowLeftRight size={23}/></span><span>SiroCash<span className="logo-dot">.</span></span></Link>
  <span className="rail-caption">{ar?'مساحة الحساب':'YOUR WORKSPACE'}</span>
  <nav aria-label={ar?'التنقّل الرئيسي للحساب':'Main account navigation'}>{items.map(item=><Link key={item.href} href={item.href} aria-current={active===item.href?'page':undefined}><item.icon size={19}/><span>{ar?item.ar:item.en}</span><i/></Link>)}</nav>
  <div className="rail-bottom"><div className="rail-security"><ShieldCheck size={22}/><strong>{ar?'الأمان في كل خطوة':'Security at every step'}</strong><p>{ar?'كلمة مرور ورمز بريد للتحقق من الدخول والتغييرات الحسّاسة.':'Password and email approval for sign-in and sensitive changes.'}</p><Link href="/settings">{ar?'إعدادات الأمان':'Security settings'}<ArrowUpRight size={14}/></Link></div><span className="rail-environment"><Wallet size={14}/>{ar?'بيئة تجريبية · دون أموال فعلية':'Preview environment · No real funds'}</span></div>
 </aside>;
}
