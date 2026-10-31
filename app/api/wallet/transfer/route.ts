import {readJson} from '@/lib/request-body';
import {requirePasskey} from '@/lib/passkey';
import {NextResponse} from 'next/server';
import {transferSchema} from '@/lib/validation';
import {debit,verifyDemoPin} from '@/lib/demo-store';
import {apiError,sameOrigin} from '@/lib/api';
export const runtime='nodejs';
export async function POST(request:Request){try{sameOrigin(request);const payload=await readJson(request);const data=transferSchema.parse(payload);if(!verifyDemoPin(data.pin))throw Error('Incorrect demo PIN. Use 123456.');await requirePasskey(request,payload);return NextResponse.json(debit(data.amount,data.recipient,'P2P'))}catch(e){return apiError(e)}}
