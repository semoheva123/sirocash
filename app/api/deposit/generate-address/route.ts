import {NextResponse} from 'next/server';
import {chainSchema} from '@/lib/validation';
import {apiError,sameOrigin} from '@/lib/api';
export async function POST(request:Request){try{sameOrigin(request);const {chain,asset}=chainSchema.parse(await request.json());return NextResponse.json({chain,asset,address:chain==='TRC20'?'TDEMO000000000000000000000000000000':'0xDEMO000000000000000000000000000000000000',demo:true,warning:'Intentionally invalid placeholder. Not a derived address. Never send real funds.'})}catch(e){return apiError(e)}}
