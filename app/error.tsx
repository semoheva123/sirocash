'use client';
import Link from 'next/link';
import {ShieldAlert,RotateCw} from 'lucide-react';
export default function ErrorPage({reset}:{reset:()=>void}){
 return <main id="main-content" tabIndex={-1} className="atelier-route-state"><section className="atelier-state-card"><span className="feature-icon"><ShieldAlert size={27}/></span><span className="eyebrow plain">SIROCASH / SAFE RECOVERY</span><h1>تعذّر تحميل الصفحة بأمان</h1><p>تعذّر التحقق من جلسة الحساب حاليًا. يُرجى إعادة المحاولة. لم يتم تحويلك إلى محفظة تجريبية.</p><p lang="en" dir="ltr">Your account session could not be verified. Please try again. No demonstration balance has been substituted.</p><div className="atelier-state-actions"><button className="button" onClick={reset}><RotateCw size={16}/>إعادة المحاولة / Retry</button><Link href="/support" className="button secondary">المساعدة / Help</Link></div></section></main>;
}
