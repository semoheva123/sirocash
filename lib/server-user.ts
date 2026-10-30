import 'server-only';
import {cache} from 'react';
import {cookies} from 'next/headers';
import {currentUser} from './email-auth';
/** Verify the database session, not merely the presence of a cookie. */
export const serverUser=cache(async()=>{
 const session=(await cookies()).get('siro-auth');
 if(!session)return null;
 return currentUser(new Request('https://session.internal.invalid',{headers:{cookie:`siro-auth=${session.value}`}}));
});
