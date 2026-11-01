import Link from 'next/link';
import {Compass,ArrowUpRight} from 'lucide-react';
export default function NotFound(){
 return <main id="main-content" tabIndex={-1} className="atelier-route-state"><section className="atelier-state-card"><span className="feature-icon"><Compass size={27}/></span><span className="eyebrow plain">SIROCASH / 404</span><h1>الصفحة غير موجودة</h1><p>قد يكون الرابط غير صحيح أو لم يعد متاحًا. يمكنك العودة إلى المنصة أو الاطلاع على إرشادات المساعدة.</p><p lang="en" dir="ltr">This page could not be found. Return to the platform or visit the help centre.</p><div className="atelier-state-actions"><Link href="/" className="button">العودة إلى المنصة<ArrowUpRight size={16}/></Link><Link href="/support" className="button secondary">المساعدة / Help</Link></div></section></main>;
}
