import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title: 'SiroCash — Your money. Without limits.', description: 'A new way to move money. Instant transfers, zero internal fees, and a connected digital wallet.'};
export default function RootLayout({ children }: { children: React.ReactNode }) {return <html lang="en"><body>{children}</body></html>}
