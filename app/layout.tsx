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
export const metadata: Metadata = {title: 'SiroCash — كل ما تحتاجه. في محفظة واحدة.', description: 'مساحة موحّدة للحساب والمحفظة الرقمية وإعدادات الحماية. نسخة تجريبية؛ السحوبات الخارجية غير مفعّلة. A considered account and wallet preview.'};
export default async function RootLayout({ children }: { children: React.ReactNode }) {await headers();const language=(await cookies()).get('siro-language')?.value==='en'?'en':'ar';return <html lang={language} dir={language==='ar'?'rtl':'ltr'} data-theme="obsidian"><body><a className="atelier-skip" href="#main-content">تجاوز التنقّل / Skip navigation</a>{children}</body></html>}
