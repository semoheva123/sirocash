import {NextResponse} from 'next/server';
import {sameOrigin} from '@/lib/api';
import {readJson} from '@/lib/request-body';
import {requireUser,sessionTokenHash} from '@/lib/email-auth';
import {customerDepositsEnabled} from '@/lib/customer-financial-http';
import {financialDatabase} from '@/lib/financial-database';
import {productionDepositDiscovery} from '@/lib/deposit-discovery-runtime';
import {customerDepositAddress} from '@/lib/customer-deposit-address';
import {securityFailure,securityHeaders} from '@/lib/security-http';
export const runtime='nodejs';
export async function POST(request:Request){try{
 sameOrigin(request);
 if(!customerDepositsEnabled())return securityFailure('الإيداع غير مفعّل. لا ترسل أموالًا.',503);
 const user=await requireUser(request),sessionHash=sessionTokenHash(request),origin=process.env.WEBAUTHN_ORIGIN;
 if(!sessionHash||!origin)throw Error('SESSION_REQUIRED');
 const input=await readJson(request,2048),chain=(input as {chain?:unknown})?.chain;
 if(chain!=='TRC20'&&chain!=='BEP20')throw Error('UNSUPPORTED_DEPOSIT_NETWORK');
 const db=financialDatabase(),discovery=productionDepositDiscovery(db);
 const historical=process.env[`SIRO_${chain}_DEPOSIT_START_BLOCK`];
 if(historical!==undefined&&!/^\d{1,15}$/.test(historical))throw Error('INVALID_HISTORICAL_START');
 const result=await customerDepositAddress(db,{userId:user.id,sessionHash,origin,rpID:new URL(origin).hostname},input,{vaultId:process.env[`SIRO_${chain}_DEPOSIT_VAULT_ID`]??'',finalHeight:discovery.finalHeight,historicalStart:historical===undefined?undefined:Number(historical)});
 return NextResponse.json(result,{headers:securityHeaders});
}catch{return securityFailure('تعذّر تخصيص عنوان إيداع موثوق. لا ترسل أموالًا قبل ظهور عنوان حسابك.',400)}}
