import {requirePasskey} from '@/lib/passkey';
import {NextResponse} from 'next/server';
import {topupSchema} from '@/lib/validation';
import {debit,verifyDemoPin} from '@/lib/demo-store';
import {apiError,sameOrigin} from '@/lib/api';
export const runtime='nodejs';
export async function POST(request:Request){try{
 sameOrigin(request);const payload=await request.json();const data=topupSchema.parse(payload);
 if(!verifyDemoPin(data.pin))throw Error('الرقم السري التجريبي غير صحيح. استخدم 123456.');
 await requirePasskey(request,payload);return NextResponse.json({...debit(data.amount,`${data.operator==='SYRIATEL'?'Syriatel':'MTN'} · ${data.phone}`,'MOBILE_TOPUP'),providerConnected:false,operator:data.operator,phone:data.phone});
}catch(e){return apiError(e)}}
