import 'server-only';
import {databaseFailureCategory} from './database-options';
import {cache} from 'react';
import {cookies} from 'next/headers';
import {currentUser} from './email-auth';
/** Verify the database session, not merely the presence of a cookie. */
export const serverUser=cache(async()=>{
 const session=(await cookies()).get('siro-auth');
 if(!session)return null;
 try{return await currentUser(new Request('https://session.internal.invalid',{headers:{cookie:`siro-auth=${session.value}`}}))}
 catch(error){console.error('ACCOUNT_SESSION_READ_FAILED',{category:databaseFailureCategory(error)});throw Error('ACCOUNT_SESSION_UNAVAILABLE')}
});
