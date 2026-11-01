'use client';
import Link from 'next/link';
import {useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {ArrowUpRight,ArrowLeftRight,LayoutDashboard,ShieldCheck,Layers,LockKeyhole,Mail,Check,Settings2} from 'lucide-react';

/** An interactive product illustration. Never substitutes for a signed-in account. */
export function ExperienceSection({ar}:{ar:boolean}){
 const [view,setView]=useState(0);const reduced=useReducedMotion();
 const t=(en:string,arabic:string)=>ar?arabic:en;
 const chapters=[
  {icon:LayoutDashboard,title:t('A clearer perspective','صورة أوضح لمحفظتك'),body:t('A composed overview, private balance controls and an uncluttered account workspace.','ملخص منظّم للمحفظة، وتحكّم في إظهار الرصيد، ووصول مباشر إلى أقسام الحساب.')},
  {icon:ShieldCheck,title:t('Control that stays with you','حماية تحت إدارتك'),body:t('Email approval for sensitive changes, session controls and a readable security history.','تأكيد التغييرات الحسّاسة عبر البريد، وإدارة الجلسات، وسجل واضح للنشاط الأمني.')},
  {icon:Layers,title:t('Every detail in its place','تفاصيل في مكانها الصحيح'),body:t('Choose an asset and its compatible network. See service availability before you proceed.','تحديد العملة والشبكة المتوافقة معها، والاطلاع على حالة الخدمة قبل المتابعة.')},
 ];
 return <section className="atelier-experience section-width" aria-labelledby="experience-title">
  <div className="atelier-chapter"><span>02 / {t('THE WORKSPACE','مساحة الحساب')}</span><span>DESIGNED AROUND YOU</span></div>
  <div className="atelier-experience-grid"><div className="atelier-experience-copy"><span className="eyebrow plain">{t('PRECISION IN EVERY DETAIL','عناية بكل تفصيل')}</span><h2 id="experience-title">{t('Less noise.','تفاصيل أقل تعقيدًا.')}<br/><span>{t('More perspective.','تجربة أكثر وضوحًا.')}</span></h2><p>{t('Explore the thinking behind your workspace. A visual introduction, not a live financial account.','استكشف طريقة تنظيم مساحة حسابك. عرض توضيحي للتجربة، وليس حسابًا ماليًا فعليًا.')}</p>
  <div className="atelier-view-options" role="group" aria-label={t('Explore the workspace','استكشاف مساحة الحساب')}>{chapters.map((item,index)=><button key={index} type="button" aria-pressed={view===index} aria-controls="workspace-illustration" onClick={()=>setView(index)}><span className="atelier-view-number">0{index+1}</span><span><strong>{item.title}</strong><small>{item.body}</small></span><ArrowUpRight size={17}/></button>)}</div>
  <Link className="text-button" href="/auth">{t('Discover your own workspace','اكتشف مساحة حسابك')}<ArrowUpRight size={17}/></Link></div>
  <div className="atelier-product" id="workspace-illustration" role="region" aria-label={t('Illustrative workspace preview','معاينة توضيحية لمساحة الحساب')}>
   <div className="atelier-product-top"><span><ArrowLeftRight size={19}/> SiroCash<span className="logo-dot">.</span></span><span>{t('INTERFACE PREVIEW','معاينة الواجهة')}</span></div>
   <div className="atelier-product-body"><div className="atelier-product-rail" aria-hidden="true">{[LayoutDashboard,ShieldCheck,Layers].map((Icon,i)=><span key={i} className={view===i?'selected':''}><Icon size={19}/></span>)}<Settings2 size={18}/></div>
   <div className="atelier-product-content" aria-live="polite" aria-atomic="true"><AnimatePresence mode="wait" initial={false}><motion.div key={view} initial={{opacity:0,y:reduced?0:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-7}} transition={{duration:reduced?0:.2}}>
    <span className="atelier-product-kicker">{t('YOUR PERSONAL SPACE','مساحتك الشخصية')}</span><h3>{chapters[view].title}</h3>
    {view===0?<><div className="atelier-preview-balance"><span>{t('Your balance, kept private','رصيدك، بخصوصية تامة')}</span><strong aria-label={t('Illustrative hidden balance','رصيد مخفي للتوضيح')} dir="ltr">•••••• <small>USD</small></strong><div>{[t('Send','إرسال'),t('Receive','استلام'),t('Deposit','إيداع')].map(label=><span key={label}>{label}</span>)}</div></div><div className="atelier-preview-row"><Layers size={19}/><span>{t('Digital assets','العملات الرقمية')}</span><b dir="ltr">USDT · USDC</b></div></>:view===1?<div className="atelier-security-preview">{[{icon:Mail,title:t('Email approval','تأكيد عبر البريد'),text:t('For sensitive account changes','للتغييرات الحسّاسة في الحساب')},{icon:LockKeyhole,title:t('Session controls','إدارة الجلسات'),text:t('Review and revoke account access','مراجعة جلسات الحساب وإنهاؤها')},{icon:ShieldCheck,title:t('Security history','سجل النشاط الأمني'),text:t('An organized record of account events','سجل منظّم لأحداث الحساب')}].map(item=><div key={item.title}><item.icon size={20}/><span><strong>{item.title}</strong><small>{item.text}</small></span><Check size={15}/></div>)}</div>:<div className="atelier-assets-preview"><div><span className="asset-logo usdt">₮</span><strong>USDT<small>Tether</small></strong><span dir="ltr">TRON<br/>BNB Smart Chain</span></div><div><span className="asset-logo usdc">$</span><strong>USDC<small>USD Coin</small></strong><span dir="ltr">Ethereum<br/>Polygon PoS</span></div><p><LockKeyhole size={14}/>{t('External withdrawals are not activated','السحوبات الخارجية غير مفعّلة')}</p></div>}
   </motion.div></AnimatePresence></div></div>
   <div className="atelier-product-bottom"><span className="atelier-preview-dot"/>{t('Illustration only · No balance or transaction data','تصميم توضيحي · دون بيانات أرصدة أو معاملات')}</div>
  </div></div>
 </section>;
}
