import {supportGet,supportPost} from '@/lib/support-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>supportGet(request);
export const POST=(request:Request)=>supportPost(request);
