import {supportGet,supportPost} from '@/lib/support-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,c:Context){return supportGet(request,(await c.params).id)}
export async function POST(request:Request,c:Context){return supportPost(request,(await c.params).id)}
