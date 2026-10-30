import {handlePasskey} from '@/lib/passkey';
import {apiError} from '@/lib/api';
export const runtime='nodejs';
export async function POST(request:Request){try{return await handlePasskey(request)}catch(e){return apiError(e)}}
