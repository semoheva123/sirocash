import {cookies} from 'next/headers';
import {AccountLoading} from '@/components/account-loading';
export default async function Loading(){return <AccountLoading ar={(await cookies()).get('siro-language')?.value!=='en'}/>}
