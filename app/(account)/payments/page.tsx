import {MobileWallet} from '@/components/mobile-wallet';
import {serverUser} from '@/lib/server-user';
import {redirect} from 'next/navigation';
export default async function PaymentsPage(){const user=await serverUser();if(!user)redirect('/auth');return <MobileWallet ownerId={user.id} view="commands"/>}
