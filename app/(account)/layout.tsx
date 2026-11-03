import {ExchangeTicker} from '@/components/exchange-ticker';
import {cookies} from 'next/headers';
import {AccountLanguageProvider} from '@/components/account-language';
import {accountBootstrap} from '@/lib/account-bootstrap';
import {ReceivingIdentityProvider} from '@/components/receiving-identity';
import {FinancialStatusProvider} from '@/components/use-financial-status';
import {serverUser} from '@/lib/server-user';
import {redirect} from 'next/navigation';
export default async function AccountLayout({children}:{children:React.ReactNode}){
 const user=await serverUser();
 if(!user)redirect('/auth');
 const language=(await cookies()).get('siro-language')?.value;
 const initial=await accountBootstrap(user);
 return <AccountLanguageProvider initialLanguage={language==='ar'||language==='en'?language:null}><FinancialStatusProvider key={user.id} userId={user.id} initialStatus={initial.financial}><ReceivingIdentityProvider key={user.id} ownerId={user.id} initialIdentity={initial.identity}><ExchangeTicker key={user.id}/>{children}</ReceivingIdentityProvider></FinancialStatusProvider></AccountLanguageProvider>;
}
