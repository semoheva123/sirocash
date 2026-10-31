import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';

const decimal=z.union([z.string(),z.number().finite().nonnegative()]).transform(String).refine(v=>/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(v),'Invalid provider amount');
const balanceSchema=z.object({balance:decimal,address:z.string().max(100)});
const costSchema=z.object({address:z.string(),type:z.literal('energy'),amount:z.number().int(),duration:z.literal(1),price:decimal,activation_fee:decimal,total:decimal});
export class TronZapError extends Error{
 constructor(public readonly kind:'CONFIGURATION'|'TRANSPORT'|'HTTP'|'AUTHENTICATION'|'PROVIDER'|'INVALID_RESPONSE',public readonly providerCode?:number){super(`TRONZAP_${kind}`);this.name='TronZapError'}
}
export function tronZapCredentials(env:Record<string,string|undefined>=process.env){
 const token=env.TRONZAP_API_TOKEN,secret=env.TRONZAP_API_SECRET;
 if(!token||!secret||token.trim()!==token||secret.trim()!==secret||/[\r\n]/.test(token)||/[\r\n]/.test(secret))throw new TronZapError('CONFIGURATION');
 return {token,secret};
}
/** Read-only allowlist. No transaction/new, subscription or AML purchase endpoint exists here. */
export function tronZapReadClient(credentials:{token:string;secret:string},fetcher:typeof fetch=fetch){
 const {token,secret}=tronZapCredentials({TRONZAP_API_TOKEN:credentials.token,TRONZAP_API_SECRET:credentials.secret});
 async function call<T>(path:'/v1/balance'|'/v1/calculate',payload:Record<string,unknown>,schema:z.ZodType<T>):Promise<T>{
  const body=JSON.stringify(payload);
  const signature=createHash('sha256').update(body+secret,'utf8').digest('hex');
  let response:Response;
  try{response=await fetcher('https://api.tronzap.com'+path,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,'X-Signature':signature,'Content-Type':'application/json'},body})}catch{throw new TronZapError('TRANSPORT')}
  if(!response.ok)throw new TronZapError(response.status===401||response.status===403?'AUTHENTICATION':'HTTP');
  // Bound streamed data so a broken upstream cannot return unbounded bodies.
  let text='';const reader=response.body?.getReader();if(!reader)throw new TronZapError('INVALID_RESPONSE');
  const decoder=new TextDecoder();let bytes=0;
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>65536){await reader.cancel();throw new TronZapError('INVALID_RESPONSE')}text+=decoder.decode(part.value,{stream:true})}text+=decoder.decode()}catch(error){if(error instanceof TronZapError)throw error;throw new TronZapError('TRANSPORT')}
  let raw:unknown;try{raw=JSON.parse(text)}catch{throw new TronZapError('INVALID_RESPONSE')}
  const envelope=z.object({code:z.number().int(),result:z.unknown().optional()}).safeParse(raw);
  if(!envelope.success)throw new TronZapError('INVALID_RESPONSE');
  if(envelope.data.code!==0)throw new TronZapError(envelope.data.code===1?'AUTHENTICATION':'PROVIDER',envelope.data.code);
  const result=schema.safeParse(envelope.data.result);if(!result.success)throw new TronZapError('INVALID_RESPONSE');
  return result.data;
 }
 return {
  balance:()=>call('/v1/balance',{},balanceSchema),
  async calculateEnergy(address:string,amount:number){
   if(!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)||!Number.isSafeInteger(amount)||amount<50000||amount>10000000)throw new TronZapError('CONFIGURATION');
   const result=await call('/v1/calculate',{address,amount,duration:1,type:'energy'},costSchema);
   if(result.address!==address||result.amount!==amount)throw new TronZapError('INVALID_RESPONSE');
   const sun=(v:string)=>{const [w,f='']=v.split('.');return BigInt(w)*1000000n+BigInt(f.padEnd(6,'0'))};
   if(sun(result.price)+sun(result.activation_fee)!==sun(result.total))throw new TronZapError('INVALID_RESPONSE');
   return result;
  },
 };
}
