import '@/app/notifications.css';
import {NotificationProvider} from '@/components/account-notifications';
import {cookies} from 'next/headers';
import {AccountLanguageProvider} from '@/components/account-language';
import {SupportCenter} from '@/components/support-center';
import {serverUser} from '@/lib/server-user';
import {supportAdmin} from '@/lib/support-center';
import {notFound,redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={title:'مكتب الدعم | SiroCash',robots:{index:false,follow:false}};
export default async function Page(){const user=await serverUser();if(!user)redirect('/auth');if(!supportAdmin(user.id))notFound();const language=(await cookies()).get('siro-language')?.value==='en'?'en':'ar';return <AccountLanguageProvider initialLanguage={language}><NotificationProvider userId={user.id}><SupportCenter staff/></NotificationProvider></AccountLanguageProvider>}
