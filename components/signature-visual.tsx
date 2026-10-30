'use client';
import {useState} from 'react';
import {ArrowLeftRight,ArrowUpRight,ArrowDownLeft,Plus,ShieldCheck,Layers,Wifi,EyeOff,Check,LockKeyhole,Mail} from 'lucide-react';

/** Interactive interface illustration. Never an issued card or a live account. */
export function SignatureVisual({ar,compact=false}:{ar:boolean;compact?:boolean}){
 const [security,setSecurity]=useState(false);
 const t=(en:string,arabic:string)=>ar?arabic:en;
 return <div className={'fintech-scene'+(compact?' fintech-scene-compact':'')} aria-label={t('Illustrative app preview, not an issued payment card','معاينة توضيحية للتطبيق، لا تمثّل بطاقة دفع فعلية')}>
  <div className="fintech-scene-disc" aria-hidden="true"/><div className="fintech-scene-grid" aria-hidden="true"/>
  <span className="fintech-scene-word" aria-hidden="true">S.</span>
  <div className="fintech-phone" dir={ar?'rtl':'ltr'}><div className="fintech-phone-status" aria-hidden="true"><span>9:41</span><span><Wifi size={12}/><i/></span></div>
   <div className="fintech-phone-brand"><span><ArrowLeftRight size={19}/>SiroCash<span>.</span></span><span className="fintech-phone-avatar">S</span></div>
   <div className="fintech-phone-greeting"><span>{t('A new perspective','تجربة مالية أوضح')}</span><strong>{t('Your personal space','أهلًا بمساحتك الجديدة')}<span>✦</span></strong></div>
   <div className="fintech-phone-tabs" role="group" aria-label={t('Explore app screens','استكشاف واجهات التطبيق')}><button type="button" aria-pressed={!security} onClick={()=>setSecurity(false)}>{t('Wallet','المحفظة')}</button><button type="button" aria-pressed={security} onClick={()=>setSecurity(true)}>{t('Security','الحماية')}</button></div>
   <div className="fintech-phone-screen" aria-live="polite" aria-atomic="true">{!security?<>
    <div className="fintech-phone-balance"><div><span>{t('Private balance preview','معاينة الرصيد المخفي')}</span><EyeOff size={15}/></div><strong dir="ltr">•••••• <small>USD</small></strong><span className="fintech-balance-decoration" aria-hidden="true">↗</span><div className="fintech-phone-actions">{[{icon:ArrowUpRight,en:'Send',ar:'إرسال'},{icon:ArrowDownLeft,en:'Receive',ar:'استلام'},{icon:Plus,en:'Deposit',ar:'إيداع'}].map(a=><span key={a.en}><a.icon size={15}/>{ar?a.ar:a.en}</span>)}</div></div>
    <div className="fintech-phone-section"><strong>{t('Digital assets','العملات الرقمية')}</strong><span>{t('Preview','معاينة')}</span></div>
    <div className="fintech-phone-assets">{[{symbol:'₮',name:'USDT',label:'Tether',className:'usdt'},{symbol:'$',name:'USDC',label:'USD Coin',className:'usdc'}].map(asset=><div key={asset.name}><span className={'fintech-coin '+asset.className}>{asset.symbol}</span><span><strong>{asset.name}</strong><small>{asset.label}</small></span><span>{t('Not activated','غير مفعّلة')}</span></div>)}</div>
   </>:<div className="fintech-phone-security"><span className="fintech-security-orb"><ShieldCheck size={31}/></span><h3>{t('Control your access','تحكّم في الوصول لحسابك')}</h3>{[{icon:Mail,en:'Email approval',ar:'تأكيد عبر البريد'},{icon:LockKeyhole,en:'Session controls',ar:'إدارة الجلسات'},{icon:ShieldCheck,en:'Security history',ar:'سجل النشاط الأمني'}].map(a=><div key={a.en}><a.icon size={16}/><span>{ar?a.ar:a.en}</span><Check size={14}/></div>)}</div>}</div>
   <div className="fintech-phone-bottom"><span className="fintech-phone-home"/><span>{t('Visual preview · No live settlement','معاينة توضيحية · دون تسوية فعلية')}</span></div>
  </div>
  <div className="fintech-float fintech-float-assets"><span className="fintech-float-icon"><Layers size={22}/></span><div><small>{t('Two assets. One space.','عملتان. مساحة واحدة.')}</small><strong>USDT <span>+</span> USDC</strong></div><ArrowUpRight size={20}/></div>
  <div className="fintech-float fintech-float-security"><span><ShieldCheck size={23}/></span><div><strong>{t('Your account. Your control.','حسابك. تحت إدارتك.')}</strong><small>{t('Password & email approval','كلمة مرور وتأكيد عبر البريد')}</small></div></div>
  <div className="fintech-scene-caption"><span className="fintech-caption-dot"/>{t('Brand illustration · Not a payment card','تصميم توضيحي · ليست بطاقة دفع')}</div>
 </div>;
}
