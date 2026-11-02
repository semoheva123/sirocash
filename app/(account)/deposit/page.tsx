import {DepositWorkspace} from '@/components/deposit-workspace';
import {serverUser} from '@/lib/server-user';
import {redirect} from 'next/navigation';
export default async function Page(){const user=await serverUser();if(!user)redirect('/auth');return <DepositWorkspace ownerId={user.id}/>}
