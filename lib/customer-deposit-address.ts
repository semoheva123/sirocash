import 'server-only';
import {z} from 'zod';
import {assertDurableSession} from './durable-passkey';
import {allocateDepositAddress} from './deposit-address-allocation';
import type {WalletDb} from './wallet-engine';
/** Trusted vault and chain-start configuration only; caller identity is authenticated out of band. */
export async function customerDepositAddress(db:WalletDb,c:Parameters<typeof assertDurableSession>[1],input:unknown,options:{vaultId:string;finalHeight:(network:string)=>Promise<number>;historicalStart?:number;requireScannerHealth?:boolean}){
 const data=z.object({chain:z.enum(['TRC20','BEP20']),asset:z.literal('USDT')}).strict().parse(input);
 z.string().uuid().parse(options.vaultId);
 const existing=await db.transaction(async tx=>{
  await assertDurableSession(tx,c);
  if(options.requireScannerHealth){
   const {rows:[health]}=await tx.query('SELECT NOT paused AND "lastSuccessAt">clock_timestamp()-interval \'10 minutes\' AND "lagBlocks"<=CASE WHEN network=\'TRC20\' THEN 300 ELSE 2000 END AS healthy FROM "DepositNetworkScanner" WHERE network=$1 FOR UPDATE',[data.chain]);
   if(health?.healthy!==true)throw Error('DEPOSIT_SCANNER_NOT_HEALTHY');
   const {rows:[capacity]}=await tx.query('SELECT count(*)<2048 OR bool_or("ownerId"=$2::uuid) AS allowed FROM "UserDepositAddress" WHERE network=$1',[data.chain,c.userId]);
   if(capacity?.allowed!==true)throw Error('DEPOSIT_ADDRESS_CAPACITY');
  }
  return (await tx.query('SELECT a.address,v.enabled,v."originVerified",s.paused,s."nextBlock" FROM "UserDepositAddress" a JOIN "DepositAddressVault" v ON v.id=a."vaultId" LEFT JOIN "DepositScanCursor" s ON s."addressId"=a.id WHERE a."ownerId"=$1 AND a.network=$2',[c.userId,data.chain])).rows[0];
 });
 if(existing&&(existing.enabled!==true||existing.originVerified!==true||existing.paused===true))throw Error('DEPOSIT_ADDRESS_NOT_ACTIVE');
 if(existing&&existing.nextBlock!==null&&existing.nextBlock!==undefined)return {chain:data.chain,asset:data.asset,address:String(existing.address),demo:false};
 // Existing assignments may have received funds already: never silently bootstrap them at today's tip.
 const head=await options.finalHeight(data.chain);
 const start=existing?options.historicalStart:head;
 if(start===undefined||!Number.isSafeInteger(start)||start<0||start>head)throw Error('DEPOSIT_HISTORICAL_START_REQUIRED');
 return db.transaction(async tx=>{
  await assertDurableSession(tx,c);
  if(options.requireScannerHealth){
   const {rows:[health]}=await tx.query('SELECT NOT paused AND "lastSuccessAt">clock_timestamp()-interval \'10 minutes\' AND "lagBlocks"<=CASE WHEN network=\'TRC20\' THEN 300 ELSE 2000 END AS healthy FROM "DepositNetworkScanner" WHERE network=$1 FOR UPDATE',[data.chain]);
   if(health?.healthy!==true)throw Error('DEPOSIT_SCANNER_NOT_HEALTHY');
   const {rows:[capacity]}=await tx.query('SELECT count(*)<2048 OR bool_or("ownerId"=$2::uuid) AS allowed FROM "UserDepositAddress" WHERE network=$1',[data.chain,c.userId]);
   if(capacity?.allowed!==true)throw Error('DEPOSIT_ADDRESS_CAPACITY');
  }
  const result=await allocateDepositAddress({transaction:run=>run(tx)},c.userId,options.vaultId,data.chain,start);
  return {chain:data.chain,asset:data.asset,address:result.address,demo:false};
 });
}
