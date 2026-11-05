import {createTronIndexRead} from '../lib/tron-index-read';
import {createTronRead} from '../lib/tron-receipt-observer';
/** Keyless, read-only PUBLIC diagnostic of the indexed discovery pipeline against TronGrid.
 * Public exchange address only; no platform addresses, secrets, database, signing or broadcast.
 * Never configures production or marks a scanner healthy. Output is a fixed set of annotations. */
const note=(title:string,message:string)=>console.log(`::notice title=${title}::${message}`);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const address=process.env.PROBE_ADDRESS||'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL';
 const endpoint='https://api.trongrid.io';
 const read=createTronRead({endpoint,readIntervalMs:3000,throttleRetries:2}),index=createTronIndexRead({endpoint,throttleRetries:2});
 const header=(v:unknown)=>{const b=v as {blockID:string;block_header:{raw_data:{number?:number;timestamp:number;parentHash?:string}}};return {id:b.blockID,n:b.block_header.raw_data.number??0,ts:b.block_header.raw_data.timestamp,parent:b.block_header.raw_data.parentHash,keys:Object.keys(b).sort().join(',')}};
 const genesis=header(await read('/walletsolidity/getblock',{id_or_num:'0',detail:false}));
 note('GENESIS',`id=${genesis.id} keys=${genesis.keys}`);
 const tip=header(await read('/walletsolidity/getblock',{detail:false}));
 note('TIP',`n=${tip.n} ts=${tip.ts} keys=${tip.keys}`);
 const previous=header(await read('/walletsolidity/getblock',{id_or_num:String(tip.n-1),detail:false}));
 note('LINK',`parentMatches=${tip.parent===previous.id} spacingMs=${tip.ts-previous.ts}`);
 await sleep(3000);
 const recent=await index(address,{minTimestamp:0,maxTimestamp:tip.ts}) as {success:boolean;data:{transaction_id:string;block_timestamp:number;to:string}[];meta:Record<string,unknown>};
 note('RECENT',`success=${recent.success} items=${recent.data.length} fingerprint=${Boolean(recent.meta.fingerprint)}`);
 if(!recent.data.length)return;
 const sample=recent.data[recent.data.length-1];
 await sleep(3000);
 const exact=await index(address,{minTimestamp:sample.block_timestamp,maxTimestamp:sample.block_timestamp+2999}) as {success:boolean;data:{transaction_id:string;block_timestamp:number;to:string}[]};
 note('WINDOW',`success=${exact.success} items=${exact.data.length} containsSample=${exact.data.some(i=>i.transaction_id===sample.transaction_id)} allTo=${exact.data.every(i=>i.to===address)} allSameSecond=${exact.data.every(i=>Math.floor(i.block_timestamp/1000)===Math.floor(sample.block_timestamp/1000))}`);
 await sleep(3000);
 const before=await index(address,{minTimestamp:sample.block_timestamp-3000,maxTimestamp:sample.block_timestamp-1}) as {data:{transaction_id:string}[]};
 note('BEFORE',`excludesSample=${!before.data.some(i=>i.transaction_id===sample.transaction_id)}`);
 const info=await read('/walletsolidity/gettransactioninfobyid',{value:sample.transaction_id}) as {id:string;blockNumber:number;receipt:{result:string};log?:unknown[]};
 note('RECEIPT',`idMatches=${info.id===sample.transaction_id} block=${info.blockNumber} result=${info.receipt?.result} logs=${info.log?.length}`);
 const included=header(await read('/walletsolidity/getblock',{id_or_num:String(info.blockNumber),detail:false}));
 note('BLOCK_TS',`headerTsMatchesIndexTs=${included.ts===sample.block_timestamp} headerTs=${included.ts} indexTs=${sample.block_timestamp}`);
 const full=await read('/walletsolidity/getblockbynum',{num:info.blockNumber}) as {blockID:string;transactions?:{txID:string}[]};
 const txIndex=(full.transactions??[]).findIndex(t=>t.txID===sample.transaction_id);
 note('ORDER',`blockIdMatches=${full.blockID===included.id} txIndex=${txIndex} txCount=${full.transactions?.length}`);
}
main().catch(e=>{note('PROBE_FAILED',e instanceof Error?e.message:'unknown');process.exitCode=1});
