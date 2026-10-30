import {ArrowLeftRight,ArrowUpRight,Fingerprint,Layers,ShieldCheck} from 'lucide-react';

/** Brand illustration, not an account, payment card, live balance or wallet address. */
export function SignatureVisual({ar,compact=false}:{ar:boolean;compact?:boolean}){
 return <div className={'signature-scene'+(compact?' signature-scene-compact':'')} aria-label={ar?'تصميم توضيحي لهوية سيرو كاش، لا يمثّل بطاقة دفع فعلية':'SiroCash brand illustration, not an issued payment card'}>
  <div className="signature-orb" aria-hidden="true"/><div className="signature-orbit orbit-a" aria-hidden="true"/><div className="signature-orbit orbit-b" aria-hidden="true"/>
  <span className="signature-coordinate" aria-hidden="true">SIROCASH / DIGITAL EXPERIENCE</span>
  <div className="signature-metal-card" aria-hidden="true"><div className="signature-card-brand"><ArrowLeftRight size={22}/><strong>SiroCash<span>.</span></strong><span>DIGITAL WALLET</span></div><svg className="signature-engraving" viewBox="0 0 420 270" fill="none"><path d="M170-50C450 30 10 180 430 290M195-60C470 40 30 185 455 300M220-70C490 50 50 190 480 310M245-80C510 60 70 195 505 320M270-90C530 70 90 200 530 330M295-100C550 80 110 205 555 340" stroke="currentColor"/><circle cx="300" cy="130" r="95" stroke="currentColor"/><circle cx="300" cy="130" r="113" stroke="currentColor"/></svg><div className="signature-chip"><i/><i/><i/></div><span className="signature-card-caption">CLARITY. BY DESIGN.</span><div className="signature-card-bottom"><span>YOUR PERSONAL SPACE</span><Fingerprint size={30} strokeWidth={1}/></div></div>
  <div className="signature-asset-panel"><div className="signature-panel-heading"><span>{ar?'العملات الرقمية':'DIGITAL ASSETS'}</span><Layers size={15}/></div><div><span className="signature-token token-usdt">₮</span><span><strong>USDT</strong><small>Tether</small></span><ArrowUpRight size={16}/></div><div><span className="signature-token token-usdc">$</span><span><strong>USDC</strong><small>USD Coin</small></span><ArrowUpRight size={16}/></div><small className="signature-panel-note">{ar?'خيارات توضيحية · دون تسوية فعلية':'Preview selections · No live settlement'}</small></div>
  <div className="signature-seal"><span><ShieldCheck size={20}/></span><div><strong>{ar?'تأكيد التغييرات الحسّاسة':'Considered account security'}</strong><small>{ar?'كلمة مرور وتحقق عبر البريد':'Password & email approval'}</small></div></div>
  <div className="signature-caption"><span>01 / SIROCASH</span><span>{ar?'تصميم توضيحي · ليست بطاقة دفع':'Brand illustration · Not a payment card'}</span></div>
 </div>;
}
