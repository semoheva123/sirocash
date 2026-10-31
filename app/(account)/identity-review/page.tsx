import {serverUser} from '@/lib/server-user';
import {operationsAllowed} from '@/lib/operations-policy';
import {redirect,notFound} from 'next/navigation';
import {IdentityReview} from '@/components/identity-review';
export default async function Page(){const user=await serverUser();if(!user)redirect('/auth');if(!user.emailVerifiedAt||!operationsAllowed(user.id,process.env.IDENTITY_REVIEWER_IDS))notFound();return <IdentityReview/>}
