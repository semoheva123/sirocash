import {depositOnlyMode,assertDepositOnlyIsolation} from '../lib/deposit-only-mode';
import {createBep20ReadRpc,productionBep20ReadRpc} from '../lib/bep20-rpc';
import {productionTronRead} from '../lib/tron-receipt-observer';
import {createNetworkDepositScanner} from '../lib/deposit-network-scanner';
import {financialReadDatabase} from '../lib/financial-database';
import {depositMonitorFailureCode} from '../lib/deposit-monitor-diagnostics';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
async function main(){
 if(process.env.VERCEL_ENV!=='production'||!depositOnlyMode()||process.env.SIRO_OUTBOX_WORKER_ENABLED!=='true'){console.log('Deposit monitor live reads: disabled.');return}
 assertDepositOnlyIsolation();
 const signal=AbortSignal.timeout(40000),bep20=productionBep20ReadRpc(signal,info=>console.log('DEPOSIT_RPC_FAILURE:'+JSON.stringify(info))),tron=productionTronRead(signal,info=>console.log('DEPOSIT_TRON_HTTP_FAILURE:'+JSON.stringify(info)));
 const scanner=createNetworkDepositScanner(financialReadDatabase(),{bep20,tron,genesisId:process.env.SIRO_TRON_GENESIS_ID??'',minimumConfirmations:Number(process.env.SIRO_BEP20_MIN_CONFIRMATIONS??'15'),maxAmount:()=>1n});
 const results=await Promise.all((['BEP20','TRC20'] as const).map(async network=>{
  let stage='FINALITY';
  try{
   const head=await scanner.finalHeight(network);stage='DISCOVERY';
   if(network==='BEP20'){
    const logs=await bep20('eth_getLogs',[{fromBlock:'0x'+head.toString(16),toBlock:'0x'+head.toString(16),address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',null,'0x'+'0'.repeat(64)]}]);
    if(!Array.isArray(logs))throw Error('SCAN_INVALID_OBJECT');
   }else if(!Array.isArray(await tron('/wallet/gettransactioninfobyblocknum',{num:head})))throw Error('SCAN_BULK_RECEIPTS_UNAVAILABLE');
   if(network==='TRC20'){
    stage='CURSOR_LOOKUP';
    const cursor=await financialReadDatabase().transaction(async tx=>(await tx.query('SELECT MIN(s."nextBlock") AS height FROM "DepositScanCursor" s JOIN "UserDepositAddress" a ON a.id=s."addressId" WHERE a.network=\'TRC20\' AND NOT s.paused')).rows[0]);
    if(cursor?.height!==null&&cursor?.height!==undefined){
     const firstHeight=Number(cursor.height);if(!Number.isSafeInteger(firstHeight)||firstHeight<0)throw Error('SCAN_INVALID_HEIGHT');
     let previousHash:string|undefined;
     const hashes=new Map<number,string>();
     for(let height=firstHeight;height<=Math.min(head,firstHeight+15);height++){
      stage='CURSOR_BLOCK';
      const block=await tron('/walletsolidity/getblockbynum',{num:height}) as {blockID?:string;block_header?:{raw_data?:{number?:number;parentHash?:string}};transactions?:{txID:string}[]};
      if(block.block_header?.raw_data?.number!==height||typeof block.blockID!=='string'||! /^[a-f0-9]{64}$/.test(block.blockID)||block.blockID.slice(0,16)!==height.toString(16).padStart(16,'0')||typeof block.block_header.raw_data.parentHash!=='string')throw Error('SCAN_BLOCK_MISMATCH');
      if(previousHash&&block.block_header.raw_data.parentHash!==previousHash)throw Error('SCAN_BLOCK_MISMATCH');
      stage='CURSOR_RECEIPTS';
      const receipts=await tron('/wallet/gettransactioninfobyblocknum',{num:height});
      if(!Array.isArray(receipts))throw Error('SCAN_BULK_RECEIPTS_UNAVAILABLE');
      const ids=new Set((block.transactions??[]).map(t=>t.txID));
      if(ids.size!==(block.transactions??[]).length||receipts.length!==ids.size||new Set(receipts.map(r=>r.id)).size!==ids.size||receipts.some(r=>!ids.has(r.id)||r.blockNumber!==height))throw Error('SCAN_INCOMPLETE_RECEIPTS');
      previousHash=block.blockID;hashes.set(height,block.blockID);
     }
     if(hashes.size){
      stage='CURSOR_BLOCK_RANGE';
      const endNum=Math.min(head+1,firstHeight+2);
      const range=await tron('/walletsolidity/getblockbylimitnext',{startNum:firstHeight,endNum}) as {block?:{blockID?:string;block_header?:{raw_data?:{number?:number}}}[]};
      if(!Array.isArray(range.block)||range.block.length!==endNum-firstHeight||range.block.some((b,i)=>b.blockID!==hashes.get(firstHeight+i)||b.block_header?.raw_data?.number!==firstHeight+i))throw Error('SCAN_BLOCK_MISMATCH');
     }
    }
   }
   return {network,stage,status:'PASS'};
  }catch(error){return {network,stage,status:'FAILED',failureCode:depositMonitorFailureCode(error)}}
 }));
 for(const result of results)console.log('DEPOSIT_MONITOR_READ_CHECK:'+JSON.stringify(result));
 if(results.some(r=>r.network==='BEP20'&&r.status!=='PASS')){
  // Diagnostic only: these public probes NEVER configure a fallback or mark a scanner healthy.
  await Promise.all(['https://1rpc.io/bnb','https://bsc-rpc.publicnode.com','https://bsc.drpc.org'].map(async endpoint=>{
   const host=new URL(endpoint).hostname;
   try{
    const read=createBep20ReadRpc({endpoint,signal:AbortSignal.timeout(20000),onFailure:info=>console.log('DEPOSIT_PUBLIC_RPC_FAILURE:'+JSON.stringify({host,...info}))});
    if(await read('eth_chainId',[])!=='0x38')throw Error('RPC_LOG_WRONG_CHAIN');
    const head=await read('eth_blockNumber',[]);
    if(typeof head!=='string'||!/^0x[0-9a-f]+$/i.test(head)||BigInt(head)<15n)throw Error('SCAN_INVALID_HEIGHT');
    const n='0x'+(BigInt(head)-15n).toString(16);
    const result=await read('eth_getLogs',[{fromBlock:n,toBlock:n,address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',null,'0x'+'0'.repeat(64)]}]);
    if(!Array.isArray(result))throw Error('SCAN_INVALID_OBJECT');
    console.log('DEPOSIT_PUBLIC_RPC_CHECK:'+JSON.stringify({host,status:'PASS_DIAGNOSTIC_ONLY'}));
   }catch(error){console.log('DEPOSIT_PUBLIC_RPC_CHECK:'+JSON.stringify({host,status:'FAILED',failureCode:depositMonitorFailureCode(error)}))}
  }));
 }
 if(results.some(r=>r.status!=='PASS'))throw Error('LIVE_READ_FAILED');
}
void main().catch(()=>{console.error('Deposit monitor live reads: FAILED; no scanner timestamps or funds changed.');process.exitCode=1});
