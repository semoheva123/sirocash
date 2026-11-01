import 'server-only';
import {TronWeb} from 'tronweb';
import {chainJsonPost,type ChainHttpOptions} from './chain-http';
import {validTronAddress} from './tron-addresses';
export function createTronActiveAccountProof(options:ChainHttpOptions&{genesisId:string}){
 if(!/^0{16}[a-f0-9]{48}$/.test(options.genesisId))throw Error('TRON_ACTIVE_GENESIS');
 const read=chainJsonPost(options);
 return async(sender:string,signal:AbortSignal)=>{
  if(!validTronAddress(sender)||signal.aborted)throw Error('TRON_ACTIVE_INPUT');
  const address=TronWeb.address.toHex(sender);
  try{
   const genesis=await read('/walletsolidity/getblockbynum',JSON.stringify({num:0}),signal) as any;
   const head=await read('/walletsolidity/getnowblock','{}',signal) as any;
   const account=await read('/walletsolidity/getaccount',JSON.stringify({address,visible:false}),signal) as any;
   if(genesis?.blockID!==options.genesisId||!Number.isSafeInteger(head?.block_header?.raw_data?.timestamp)||Math.abs(Date.now()-head.block_header.raw_data.timestamp)>120000||account?.address!==address||signal.aborted)throw Error();
  }catch{throw Error('TRON_ACTIVE_ACCOUNT_UNPROVEN')}
 };
}
