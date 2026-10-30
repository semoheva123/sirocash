import {requirePasskey} from '@/lib/passkey';
import {NextResponse} from 'next/server';
import {shamCashSchema} from '@/lib/validation';
import {debit,verifyDemoPin} from '@/lib/demo-store';
import {apiError,sameOrigin} from '@/lib/api';
export const runtime='nodejs';
export async function POST(request:Request){try{
 sameOrigin(request);const payload=await request.json();const data=shamCashSchema.parse(payload);
 if(!verifyDemoPin(data.pin))throw Error('الرقم السري التجريبي غير صحيح. استخدم 123456.');
 await requirePasskey(request,payload);return NextResponse.json({...debit(data.amount,`Sham Cash · ${data.recipient}`,'SHAM_CASH'),providerConnected:false});
}catch(e){return apiError(e)}}
