import {quoteUsdtWithdrawal} from '@/lib/withdrawal-fees';
import {requirePasskey} from '@/lib/passkey';
import {NextResponse} from 'next/server';
import {withdrawalSchema} from '@/lib/validation';
import {debit,verifyDemoPin} from '@/lib/demo-store';
import {apiError,sameOrigin} from '@/lib/api';
export const runtime='nodejs';
export async function POST(request:Request){try{sameOrigin(request);const payload=await request.json();const data=withdrawalSchema.parse(payload);const quote=data.asset==='USDT'?quoteUsdtWithdrawal(data.chain,String(data.amount)):null;if(!verifyDemoPin(data.pin))throw Error('Incorrect demo PIN. Use 123456.');await requirePasskey(request,payload);const result=debit(data.amount,`${data.asset} · ${data.chain} · ${data.recipient}`,'WITHDRAWAL',{asset:data.asset,chain:data.chain});return NextResponse.json({...result,withdrawalQuote:quote})}catch(e){return apiError(e)}}
