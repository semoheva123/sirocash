import 'server-only';
import {z} from 'zod';
import type {WalletDb} from './wallet-engine';
import {postValuedDeposit} from './deposit-valuation';
import {observeUsdtUsdPrice,persistFinancialPrice} from './financial-price';
/** Converts already verified final inbox evidence into a journal credit; never accepts customer receipts. */
export function createDepositValuationWorker(db:WalletDb,options:{enabled:boolean;settlementAccountId:string;price?:typeof observeUsdtUsdPrice}){
 return async(id:string,signal:AbortSignal)=>{
  if(!options.enabled)return {state:'HELD',reason:'DEPOSIT_VALUATION_DISABLED'} as const;
  z.string().uuid().parse(id);z.string().uuid().parse(options.settlementAccountId);
  if(signal.aborted)throw Error('VALUATION_ABORTED');
  const before=await db.transaction(async tx=>(await tx.query('SELECT state FROM "ChainDepositInbox" WHERE id=$1',[id])).rows[0]);
  if(!before)throw Error('DEPOSIT_NOT_FOUND');
  if(before.state==='CREDITED')return postValuedDeposit(db,id);
  const price=await (options.price??observeUsdtUsdPrice)();
  return db.transaction(async tx=>{
   if(signal.aborted)throw Error('VALUATION_ABORTED');
   const {rows:[inbox]}=await tx.query('SELECT * FROM "ChainDepositInbox" WHERE id=$1 FOR UPDATE',[id]);
   if(!inbox)throw Error('DEPOSIT_NOT_FOUND');
   if(inbox.state==='CREDITED')return postValuedDeposit({transaction:run=>run(tx)},id);
   if(inbox.state!=='AWAITING_VALUATION')throw Error('DEPOSIT_NOT_ELIGIBLE');
   const {rows:[prior]}=await tx.query('SELECT "inboxId" FROM "ApprovedDepositValuation" WHERE "inboxId"=$1',[id]);
   if(!prior){
    const observation=await persistFinancialPrice(tx,price);
    await tx.query('INSERT INTO "ApprovedDepositValuation" ("inboxId","inboxFingerprint","quoteReference","rateUsdMicrosPerToken",policy,"settlementAccountId","approvedAt","expiresAt") VALUES ($1,$2,$3,$4,\'floor-usd-micros-v1\',$5,$6,$7)',[id,inbox.fingerprint,observation.reference,price.rate.toString(),options.settlementAccountId,observation.approvedAt,observation.expiresAt]);
   }
   // Valuation insert, approval consumption equivalent (operation binding), journal and inbox commit together.
   return postValuedDeposit({transaction:run=>run(tx)},id);
  });
 };
}
