import {requirePasskey} from '@/lib/passkey';
import {NextResponse} from 'next/server';
import {withdrawalSchema} from '@/lib/validation';
import {debit,verifyDemoPin} from '@/lib/demo-store';
import {apiError,sameOrigin} from '@/lib/api';
export const runtime='nodejs';
export async function POST(request:Request){try{sameOrigin(request);const payload=await request.json();const data=withdrawalSchema.parse(payload);if(!verifyDemoPin(data.pin))throw Error('Incorrect demo PIN. Use 123456.');await requirePasskey(request,payload);return NextResponse.json(debit(data.amount,`${data.asset} · ${data.chain} · ${data.recipient}`,'WITHDRAWAL',{asset:data.asset,chain:data.chain}))}catch(e){return apiError(e)}}
