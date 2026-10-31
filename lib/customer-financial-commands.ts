import 'server-only';
import {z} from 'zod';
import {assertDurableSession,consumeDurableApproval} from './durable-passkey';
import {createUsdtWithdrawalQuote,reserveQuotedUsdtWithdrawal} from './quoted-usdt-withdrawal';
import {internalTransferQuote,transferWallet,type WalletDb} from './wallet-engine';
import {paymentDigest} from './payment-intent';
import {observeUsdtUsdPrice,persistFinancialPrice} from './financial-price';
type Context=Parameters<typeof assertDurableSession>[1];
const requestKey=z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/),amount=z.string().regex(/^\d{1,14}(\.\d{1,6})?$/);
const transfer=z.object({kind:z.literal('TRANSFER'),recipient:z.string().uuid(),amount,requestKey}).strict();
const withdrawal=z.object({kind:z.literal('WITHDRAWAL'),recipient:z.string().min(20).max(100),amount,requestKey,chain:z.enum(['TRC20','BEP20']),asset:z.literal('USDT')}).strict();
const command=z.discriminatedUnion('kind',[transfer,withdrawal]);
/** Server-owned identity/account/rate bindings. Browser cannot provide owner, rate, fee or evidence. */
export function customerFinancialCommands(db:WalletDb,options:{settlementAccountId:string;feeAccountId:string;price?:typeof observeUsdtUsdPrice}){
 const accounts=z.object({settlementAccountId:z.string().uuid(),feeAccountId:z.string().uuid()}).parse(options);
 if(accounts.settlementAccountId===accounts.feeAccountId)throw Error('FINANCIAL_ACCOUNTS_MUST_DIFFER');
 return {
  prepare:async(c:Context,input:unknown)=>{
   const data=command.parse(input);
   // Authenticate before spending a price-provider request. Check again at commit after the request.
   await db.transaction(tx=>assertDurableSession(tx,c));
   if(data.kind==='TRANSFER'){
    if(data.recipient.toLowerCase()===c.userId.toLowerCase())throw Error('SELF_TRANSFER');
    const q=internalTransferQuote(data.amount),payload={recipient:data.recipient.toLowerCase(),amount:q.amount,requestKey:data.requestKey,fee:q.fee,totalDebit:q.totalDebit,feePolicy:q.feePolicy};
    return {kind:'TRANSFER' as const,path:'/api/wallet/transfer',payload,digest:paymentDigest('/api/wallet/transfer',payload)};
   }
   const prior=await db.transaction(async tx=>{await assertDurableSession(tx,c);return (await tx.query('SELECT * FROM "UsdtWithdrawalQuote" WHERE "ownerId"=$1 AND "requestKey"=$2',[c.userId,data.requestKey])).rows[0]});
   const price=prior?undefined:await (options.price??observeUsdtUsdPrice)();
   return db.transaction(async tx=>{
    await assertDurableSession(tx,c);
    let rate:bigint,rateReference:string,expiresAt:string;
    if(prior){rate=BigInt(String(prior.rateUsdMicrosPerToken));rateReference=String(prior.rateReference);expiresAt=new Date(String(prior.expiresAt)).toISOString()}
    else{
     const observation=await persistFinancialPrice(tx,price!);
     rate=price!.rate;rateReference=observation.reference;expiresAt=observation.expiresAt;
    }
    const quote=await createUsdtWithdrawalQuote({transaction:run=>run(tx)},{ownerId:c.userId,requestKey:data.requestKey,network:data.chain,recipient:data.recipient,grossTokens:data.amount,rateUsdMicrosPerToken:rate,rateReference,expiresAt,...accounts});
    return {kind:'WITHDRAWAL' as const,path:'/api/wallet/withdraw',...quote};
   });
  },
  transfer:async(c:Context,input:unknown,approvalToken:string)=>{
   const data=transfer.parse(input),q=internalTransferQuote(data.amount);
   const payload={recipient:data.recipient.toLowerCase(),amount:q.amount,requestKey:data.requestKey,fee:q.fee,totalDebit:q.totalDebit,feePolicy:q.feePolicy};
   return db.transaction(async tx=>{
    await assertDurableSession(tx,c);
    const {rows:[prior]}=await tx.query('SELECT state FROM "WalletOperation" WHERE "ownerId"=$1 AND "requestKey"=$2',[c.userId,data.requestKey]);
    if(prior?.state!=='COMPLETED')await consumeDurableApproval(tx,c,approvalToken,paymentDigest('/api/wallet/transfer',payload));
    // Exact retries still run the ledger fingerprint comparison; a changed command cannot bypass approval.
    return transferWallet({transaction:run=>run(tx)},{ownerId:c.userId,recipientId:data.recipient,feeAccountId:accounts.feeAccountId,amount:data.amount,requestKey:data.requestKey});
   });
  },
  withdraw:(c:Context,input:unknown,approvalToken:string)=>{
   const {quoteId}=z.object({quoteId:z.string().uuid()}).strict().parse(input);
   return reserveQuotedUsdtWithdrawal(db,c,{quoteId,approvalToken});
  }
 };
}
