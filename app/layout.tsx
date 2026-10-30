import type { Metadata } from 'next';
import '@fontsource-variable/manrope';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
import './design-system.css';
import './signature.css';
import './atelier.css';
export const metadata: Metadata = {title: 'SiroCash — مساحة مالية صُمّمت بعناية', description: 'مساحة موحّدة للحساب والمحفظة الرقمية وإعدادات الحماية. نسخة تجريبية؛ الخدمات المالية الفعلية غير مفعّلة. A considered account and wallet preview.'};
export default function RootLayout({ children }: { children: React.ReactNode }) {return <html lang="ar" dir="rtl"><body><a className="atelier-skip" href="#main-content">تجاوز التنقّل / Skip navigation</a>{children}</body></html>}
