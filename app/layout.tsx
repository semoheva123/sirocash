import type { Metadata } from 'next';
import '@fontsource-variable/manrope';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
import './design-system.css';
export const metadata: Metadata = {title: 'SiroCash — Your money. Without limits.', description: 'A new way to move money. Instant transfers, zero internal fees, and a connected digital wallet.'};
export default function RootLayout({ children }: { children: React.ReactNode }) {return <html lang="ar" dir="rtl"><body>{children}</body></html>}
