import {FinancialStatusProvider} from '@/components/use-financial-status';
import {serverUser} from '@/lib/server-user';
import {redirect} from 'next/navigation';
export default async function AccountLayout({children}:{children:React.ReactNode}){
 const user=await serverUser();
 if(!user)redirect('/auth');
 return <FinancialStatusProvider userId={user.id}>{children}</FinancialStatusProvider>;
}
