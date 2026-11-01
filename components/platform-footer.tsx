import Link from 'next/link';
import {ArrowLeftRight, ArrowUpRight, Layers} from 'lucide-react';

/** Real destinations and transparent release status, not invented endorsements. */
export function PlatformFooter({ar,account=false}:{ar:boolean;account?:boolean}) {
 const t=(en:string,arabic:string)=>ar?arabic:en;
 return <footer className={`footer section-width premium-footer${account?' premium-footer-compact':''}`}>
  <div className="premium-footer-grid"><div className="premium-footer-brand">
   <Link href={account?'/dashboard':'/'} className="logo"><span className="logo-mark"><ArrowLeftRight size={22}/></span><span>SiroCash<span className="logo-dot">.</span></span></Link>
   <p>{t('A clearer perspective on your digital wallet. Considered in every detail.','رؤية أوضح لمحفظتك الرقمية. وعناية تستحقّها في كل تفصيل.')}</p>
  </div><nav aria-label={t('Platform resources','روابط المنصة')}><strong>{t('Your next step','خطوتك التالية')}</strong><Link href={account?'/settings':'/auth'}>{account?t('Account & security','الحساب والحماية'):t('Create your account','أنشئ حسابك')}<ArrowUpRight size={14}/></Link><Link href="/trust">{t('Platform status','حالة المنصة')}<ArrowUpRight size={14}/></Link><Link href="/support">{t('Help & guidance','المساعدة والإرشادات')}<ArrowUpRight size={14}/></Link></nav>
   {!account&&<nav aria-label={t('Legal information','المعلومات القانونية')}><strong>{t('Transparency first','الشفافية أولًا')}</strong><Link href="/privacy">{t('Privacy notice','إشعار الخصوصية')}</Link><Link href="/terms">{t('Preview terms','شروط النسخة التجريبية')}</Link><span className="premium-footer-disclosure">{t('Financial services are not activated. Do not send real funds.','الخدمات المالية غير مفعّلة. لا ترسل أموالًا فعلية.')}</span></nav>}
  </div><div className="premium-footer-bottom"><span>© 2026 SiroCash</span><span><Layers size={14}/>{t('Product preview','نسخة تجريبية')}</span><span>{t('Arabic & English. Designed around you.','عربية وإنجليزية. تجربة تتمحور حولك.')}</span></div>
 </footer>;
}
