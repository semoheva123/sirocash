import {supportAdmin} from '@/lib/support-center';
import {operationsAllowed} from '@/lib/operations-policy';
import {serverUser} from '@/lib/server-user';
import {redirect} from 'next/navigation';
import {AccountSettings} from '@/components/account-settings';
export default async function Page(){
 const user=await serverUser();
 if(!user)redirect('/auth');
 return <AccountSettings user={user} canManageSupport={supportAdmin(user.id)} canReviewIdentity={operationsAllowed(user.id,process.env.IDENTITY_REVIEWER_IDS)}/>;
}
