import {logout,emailAuthError} from '@/lib/email-auth';
export const runtime='nodejs';
export async function POST(r:Request){try{return await logout(r)}catch(e){return emailAuthError(e)}}
