import {serverUser} from '@/lib/server-user';
import {redirect} from 'next/navigation';
export default async function AccountLayout({children}:{children:React.ReactNode}){
 if(!await serverUser())redirect('/auth');
 return children;
}
