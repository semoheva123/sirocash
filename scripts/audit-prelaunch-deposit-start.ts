import {financialReadDatabase} from '../lib/financial-database';
import {auditUnusedTronAddress} from '../lib/prelaunch-tron-audit';
import {productionTronRead} from '../lib/tron-receipt-observer';
import {assertDepositOnlyIsolation} from '../lib/deposit-only-mode';
async function main(){
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_PRELAUNCH_DEPOSIT_AUDIT!=='true'){console.log('Prelaunch audit: disabled.');return}
 assertDepositOnlyIsolation();
 const db=financialReadDatabase();
 const data=await db.transaction(async tx=>{
  const counts=await tx.query('SELECT (SELECT count(*) FROM "ChainDepositInbox") AS inbox,(SELECT count(*) FROM "ApprovedDepositValuation") AS valuations,(SELECT count(*) FROM "LedgerEntry") AS ledger,(SELECT count(*) FROM "WalletOperation") AS operations');
  if(!counts.rows[0]||Object.values(counts.rows[0]).some(v=>String(v)!=='0'))throw Error('PRELAUNCH_DB_NOT_EMPTY');
  const addresses=await tx.query('SELECT a.id,a.address,s."nextBlock" FROM "UserDepositAddress" a JOIN "DepositScanCursor" s ON s."addressId"=a.id WHERE a.network=\'TRC20\' AND NOT s.paused');
  if(addresses.rows.length!==1)throw Error('PRELAUNCH_SCOPE_NOT_SINGLE_ADDRESS');
  return addresses.rows[0];
 });
 const signal=AbortSignal.timeout(60000),read=productionTronRead(signal);
 const block=await read('/walletsolidity/getnowblock',{}) as {blockID:string;block_header:{raw_data:{number:number}}};
 const head=block?.block_header?.raw_data?.number;
 if(!Number.isSafeInteger(head)||head<301||! /^[a-f0-9]{64}$/.test(block.blockID)||block.blockID.slice(0,16)!==head.toString(16).padStart(16,'0'))throw Error('PRELAUNCH_HEAD_INVALID');
 const evidence=await auditUnusedTronAddress(String(data.address),{apiKey:process.env.SIRO_TRON_RPC_API_KEY??'',signal});
 // Preserve a 300-block overlap; this is a proposal only. No cursor/health writes.
 const proposedNextBlock=head-300;
 const anchor=await read('/walletsolidity/getblockbynum',{num:proposedNextBlock-1}) as {blockID:string;block_header:{raw_data:{number:number}}};
 if(anchor?.block_header?.raw_data?.number!==proposedNextBlock-1||! /^[a-f0-9]{64}$/.test(anchor.blockID)||anchor.blockID.slice(0,16)!==(proposedNextBlock-1).toString(16).padStart(16,'0'))throw Error('PRELAUNCH_ANCHOR_INVALID');
 const recheck=await read('/walletsolidity/getblockbynum',{num:proposedNextBlock-1}) as {blockID:string};
 if(recheck.blockID!==anchor.blockID)throw Error('PRELAUNCH_ANCHOR_CHANGED');
 console.log('PRELAUNCH_EMPTY_ADDRESS_EVIDENCE:'+JSON.stringify({addressId:data.id,checkedAt:new Date().toISOString(),observedCursor:Number(data.nextBlock),head,proposedNextBlock,previousBlockHash:anchor.blockID,...evidence,dbFinancialRows:0,overlapBlocks:300,noWrites:true}));
}
void main().catch(error=>{const safe=new Set(['PRELAUNCH_DB_NOT_EMPTY','PRELAUNCH_SCOPE_NOT_SINGLE_ADDRESS','PRELAUNCH_HEAD_INVALID','PRELAUNCH_AUDIT_CONFIGURATION','PRELAUNCH_HISTORY_UNAVAILABLE','PRELAUNCH_HISTORY_LIMIT','PRELAUNCH_HISTORY_NOT_EMPTY_OR_INCOMPLETE','PRELAUNCH_ACCOUNT_NOT_EMPTY','PRELAUNCH_USDT_BALANCE_NOT_ZERO','PRELAUNCH_ANCHOR_INVALID','PRELAUNCH_ANCHOR_CHANGED','CHAIN_HTTP_FAILED']);console.error('PRELAUNCH_AUDIT_REFUSED:'+ (error instanceof Error&&safe.has(error.message)?error.message:'UNCLASSIFIED')+'; no cursor or health changed.');process.exitCode=1});
