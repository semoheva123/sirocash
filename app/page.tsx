import {publicMetadata,siteOrigin} from '@/lib/public-seo';
import Link from 'next/link';
import {SiroApp} from '@/components/siro-app';
import {serverUser} from '@/lib/server-user';
import {redirect} from 'next/navigation';
export const metadata={...publicMetadata('/','SiroCash | سيرو كاش — محفظة رقمية بالعربية والإنجليزية','محفظة سيرو كاش: إدارة الحساب وسجل العمليات وحماية الجلسات وتثبيت تطبيق الويب على أندرويد وآيفون. تعرّف إلى حالة الخدمات وحدودها.'),alternates:{canonical:siteOrigin,languages:{ar:siteOrigin,en:siteOrigin+'/en','x-default':siteOrigin}}};
export default async function Page(){
 if(await serverUser())redirect('/dashboard');
 return <><SiroApp page="home"/><nav className="section-width public-discovery" aria-label="عن SiroCash"><Link href="/features">عن سيرو كاش ومزايا المحفظة</Link><Link href="/install">تثبيت التطبيق لأندرويد وآيفون</Link><Link href="/en" hrefLang="en">English</Link></nav></>;
}
