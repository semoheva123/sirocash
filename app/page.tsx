import {SiroApp} from '@/components/siro-app';
import {serverUser} from '@/lib/server-user';
import {redirect} from 'next/navigation';
export default async function Page(){
 if(await serverUser())redirect('/dashboard');
 return <SiroApp page="home"/>;
}
