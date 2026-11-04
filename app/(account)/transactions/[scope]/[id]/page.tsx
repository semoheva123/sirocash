import {notFound,redirect} from 'next/navigation';
import {serverUser} from '@/lib/server-user';
import {TransactionPage} from '@/components/transaction-page';
export default async function Page({params}:{params:Promise<{scope:string;id:string}>}){
 const {scope,id}=await params;if(!['activity','deposits','withdrawals','operation'].includes(scope)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))notFound();
 const user=await serverUser();if(!user)redirect('/auth');return <TransactionPage ownerId={user.id} scope={scope as 'activity'|'deposits'|'withdrawals'|'operation'} id={id}/>;
}
