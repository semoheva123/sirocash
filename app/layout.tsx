import {PwaRegister} from '@/components/pwa-register';
import {siteOrigin} from '@/lib/public-seo';
import {headers,cookies} from 'next/headers';
import type { Metadata } from 'next';
import '@fontsource-variable/manrope';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
import './design-system.css';
import './signature.css';
import './atelier.css';
import './fintech.css';
import './world-class.css';
import './professional.css';
import './obsidian.css';
import './deposit.css';
import './mobile-wallet.css';
import './support-center.css';
import './exchange-ticker.css';
import './wallet-feedback.css';
export const metadata: Metadata = {
 metadataBase:new URL(siteOrigin),title:'SiroCash | سيرو كاش — محفظة رقمية بالعربية والإنجليزية',
 description:'تعرّف إلى محفظة سيرو كاش: إدارة الحساب وسجل العمليات وحماية الجلسات وتطبيق ويب قابل للتثبيت على أندرويد وآيفون. راجع حالة الخدمات وحدود النسخة الحالية.',
 applicationName:'SiroCash',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'SiroCash',statusBarStyle:'black-translucent'},
 icons:{icon:'/icons/icon-192.png',apple:'/icons/apple-touch-icon.png'},formatDetection:{telephone:false},robots:{index:false,follow:false},
};
export const viewport={width:'device-width',initialScale:1,themeColor:'#0B0B0F',viewportFit:'cover' as const};
export default async function RootLayout({ children }: { children: React.ReactNode }) {const incoming=await headers(),nonce=incoming.get('Content-Security-Policy')?.match(/'nonce-([^']+)'/)?.[1];const language=incoming.get('x-siro-pathname')==='/en'?'en':(await cookies()).get('siro-language')?.value==='en'?'en':'ar';return <html lang={language} dir={language==='ar'?'rtl':'ltr'} data-theme="obsidian"><body><PwaRegister/><script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'SiroCash',alternateName:'سيرو كاش',url:siteOrigin,inLanguage:['ar','en']})}}/><a className="atelier-skip" href="#main-content">تجاوز التنقّل / Skip navigation</a>{children}</body></html>}
