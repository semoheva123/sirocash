import 'server-only';
import {base58} from '@scure/base';
import {validTronAddress} from './tron-addresses';
import {tronUsdtContract} from './tron-deposit-verification';
import {chainJsonPost} from './chain-http';
/** Read-only, operator-only prelaunch evidence. Empty DB/balance alone is NOT history proof.
 * The indexed history result is provider evidence, not a cryptographic non-inclusion proof.
 * Never use this to reset a live platform, or advance a cursor automatically. */
export async function auditUnusedTronAddress(address:string,options:{apiKey:string;signal:AbortSignal;fetch?:typeof fetch}){
 if(!validTronAddress(address)||!options.apiKey||/[\r\n]/.test(options.apiKey)||options.apiKey.length>8192)throw Error('PRELAUNCH_AUDIT_CONFIGURATION');
 const request=options.fetch??fetch;
 const get=async(path:string)=>{
  const response=await request('https://api.trongrid.io'+path,{redirect:'error',cache:'no-store',signal:options.signal,headers:{Accept:'application/json','TRON-PRO-API-KEY':options.apiKey}});
  if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||!response.body)throw Error('PRELAUNCH_HISTORY_UNAVAILABLE');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)throw Error('PRELAUNCH_HISTORY_LIMIT');chunks.push(part.value)}}finally{void reader.cancel().catch(()=>{})}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Record<string,unknown>;
 };
 // No contract or timestamp filter: any indexed TRC20 activity, in either direction,
 // prevents the unused-address decision. One item suffices to refuse; no pagination skip.
 const history=await get('/v1/accounts/'+address+'/transactions/trc20?limit=1');
 const meta=history.meta as Record<string,unknown>|undefined,links=meta?.links as Record<string,unknown>|undefined;
 if(history.success!==true||!Array.isArray(history.data)||history.data.length!==0||!meta||meta.page_size!==0||typeof meta.at!=='number'||Math.abs(Date.now()-meta.at)>300000||meta.fingerprint||links?.next)throw Error('PRELAUNCH_HISTORY_NOT_EMPTY_OR_INCOMPLETE');
 const hex=Buffer.from(base58.decode(address)).subarray(0,21).toString('hex');
 const post=chainJsonPost({endpoint:'https://api.trongrid.io',apiKey:options.apiKey,fetch:request});
 const account=await post('/walletsolidity/getaccount',JSON.stringify({address:hex,visible:false}),options.signal) as Record<string,unknown>;
 // Conservatively refuse even an activated zero-balance account.
 if(!account||Array.isArray(account)||typeof account!=='object'||Object.keys(account).length!==0)throw Error('PRELAUNCH_ACCOUNT_NOT_EMPTY');
 const contract=Buffer.from(base58.decode(tronUsdtContract)).subarray(0,21).toString('hex');
 const result=await post('/wallet/triggerconstantcontract',JSON.stringify({owner_address:hex,contract_address:contract,function_selector:'balanceOf(address)',parameter:hex.slice(2).padStart(64,'0'),visible:false}),options.signal) as {result?:{result?:boolean};constant_result?:unknown[]};
 if(result?.result?.result!==true||!Array.isArray(result.constant_result)||result.constant_result.length!==1||typeof result.constant_result[0]!=='string'||!/^0{64}$/.test(result.constant_result[0]))throw Error('PRELAUNCH_USDT_BALANCE_NOT_ZERO');
 return {indexedTrc20HistoryEmpty:true,nativeBalanceZero:true,usdtBalanceZero:true,source:'TRONGRID' as const};
}
