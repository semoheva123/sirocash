import {currentUser} from '@/lib/email-auth';
import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{return NextResponse.json({user:await currentUser(r)},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({user:null},{status:503,headers:{'Cache-Control':'no-store'}})}}
