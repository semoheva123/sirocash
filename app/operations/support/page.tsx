import {SupportCenter} from '@/components/support-center';
import {serverUser} from '@/lib/server-user';
import {supportAdmin} from '@/lib/support-center';
import {notFound,redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={title:'مكتب الدعم | SiroCash',robots:{index:false,follow:false}};
export default async function Page(){const user=await serverUser();if(!user)redirect('/auth');if(!supportAdmin(user.id))notFound();return <SupportCenter staff/>}
