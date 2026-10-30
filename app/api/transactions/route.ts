import {NextResponse} from 'next/server';
import {store} from '@/lib/demo-store';
export const dynamic='force-dynamic';
export async function GET(){return NextResponse.json({transactions:store.transactions,balance:store.balanceCents/100,demo:true},{headers:{'Cache-Control':'no-store'}})}
