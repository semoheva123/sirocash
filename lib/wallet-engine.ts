/** Private financial domain service. NOT a provider verifier or a public HTTP API.
 * Callers must authenticate, authorize the exact command and verify provider evidence.
 * Runtime financial writes remain disabled until dedicated privileges and durable approval exist.
 */
import {createHash,randomUUID} from 'node:crypto';
export type WalletTx={query:(sql:string,params?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
export type WalletDb={transaction:<T>(run:(tx:WalletTx)=>Promise<T>)=>Promise<T>};
function transact<T>(db:WalletDb,run:(tx:WalletTx)=>Promise<T>){return db.transaction(async tx=>{
 // Fresh aggregate reads after waiting for an account lock must see committed reservations.
 await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');return run(tx);
})}
type Command={ownerId:string;requestKey:string;amount:string};
type Operation={id:string;state:string;transactionId:string|null;amount:string;fee:string;totalDebit:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value:string){if(!uuid.test(value))throw Error('INVALID_ACCOUNT');return value.toLowerCase()}
export function moneyMicros(value:string){
 if(typeof value!=='string'||!/^\d{1,14}(\.\d{1,6})?$/.test(value))throw Error('INVALID_AMOUNT');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
}
export function moneyString(value:bigint){if(value<0n)throw Error('INVALID_BALANCE');return `${value/1000000n}.${String(value%1000000n).padStart(6,'0')}`}
function amount(value:string){const micros=moneyMicros(value);if(micros<=0n||micros>100000n*1000000n)throw Error('INVALID_AMOUNT');return moneyString(micros)}
export function internalTransferQuote(value:string){const principal=moneyMicros(amount(value)),fee=(principal+99n)/100n;return {amount:moneyString(principal),fee:moneyString(fee),totalDebit:moneyString(principal+fee),feeRateBps:100,feePolicy:'internal-sender-1pct-v1' as const}}
function reference(value:string){if(typeof value!=='string'||value.length<8||value.length>200||/[\x00-\x1f]/.test(value))throw Error('INVALID_REFERENCE');return value}
function operation(row:Record<string,unknown>):Operation{return {id:String(row.id),state:String(row.state),transactionId:row.transactionId?String(row.transactionId):null,amount:String(row.amount),fee:moneyString(moneyMicros(String(row.feeAmount??'0'))),totalDebit:moneyString(moneyMicros(String(row.amount))+moneyMicros(String(row.feeAmount??'0')))}}
async function begin(tx:WalletTx,c:Command,kind:string,other:string|null=null,destination:string|null=null,external:string|null=null,pricing?:{fee:string;accountId:string}){
 const owner=id(c.ownerId),value=amount(c.amount);if(!/^[A-Za-z0-9:_-]{8,128}$/.test(c.requestKey))throw Error('INVALID_REQUEST_KEY');
 const details:unknown[]=[kind,owner,value,other,destination,external];if(pricing)details.push([pricing.fee,pricing.accountId,'internal-sender-1pct-v1']);
 const fingerprint=createHash('sha256').update(JSON.stringify(details)).digest('hex');
 await tx.query('INSERT INTO "WalletOperation" (id,"ownerId","requestKey",fingerprint,kind,amount,"counterpartyId",destination,"externalReference","feeAmount","feeAccountId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT ("ownerId","requestKey") DO NOTHING',[randomUUID(),owner,c.requestKey,fingerprint,kind,value,other,destination,external,pricing?.fee||'0',pricing?.accountId||null]);
 const {rows:[row]}=await tx.query('SELECT * FROM "WalletOperation" WHERE "ownerId"=$1 AND "requestKey"=$2 FOR UPDATE',[owner,c.requestKey]);
 if(!row||row.fingerprint!==fingerprint)throw Error('IDEMPOTENCY_CONFLICT');return row;
}
async function accounts(tx:WalletTx,users:string[],poolId?:string){
 // Lock in deterministic UUID order. All balance-consuming operations use these same locks.
 const owners=[...new Set(users.map(id))].sort();
 for(const owner of owners){
  const {rows:[user]}=await tx.query('SELECT id FROM "User" WHERE id=$1 AND "emailVerifiedAt" IS NOT NULL',[owner]);if(!user)throw Error('ACCOUNT_UNAVAILABLE');
  await tx.query('INSERT INTO "LedgerAccount" (id,"userId","accountType",currency) VALUES ($1,$2,\'USER\',\'USD\') ON CONFLICT ("userId","accountType",currency) DO NOTHING',[randomUUID(),owner]);
 }
 const {rows}=await tx.query('SELECT id,"userId",balance,"accountType",currency FROM "LedgerAccount" WHERE ("userId"=ANY($1::uuid[]) AND "accountType"=\'USER\' AND currency=\'USD\') OR id=$2 ORDER BY id FOR UPDATE',[owners,poolId?id(poolId):null]);
 const owned=new Map(rows.filter(r=>r.userId).map(r=>[String(r.userId),r]));
 if(owned.size!==owners.length)throw Error('ACCOUNT_UNAVAILABLE');
 if(poolId&&!rows.some(r=>r.id===poolId.toLowerCase()&&r.accountType==='MASTER_POOL'&&!r.userId&&r.currency==='USD'))throw Error('INVALID_SETTLEMENT_ACCOUNT');
 return owned;
}
async function available(tx:WalletTx,owner:string,balance:string,exclude:string|null=null){
 const {rows:[row]}=await tx.query('SELECT COALESCE(SUM(amount),0)::text AS held FROM "WalletOperation" WHERE "ownerId"=$1 AND kind=\'WITHDRAWAL\' AND state IN (\'RESERVED\',\'SUBMITTED\') AND ($2::uuid IS NULL OR id<>$2)',[owner,exclude]);
 const funds=moneyMicros(balance)-moneyMicros(String(row.held));if(funds<0n)throw Error('INCONSISTENT_RESERVATIONS');return funds;
}
async function post(tx:WalletTx,row:Record<string,unknown>,type:string,sender:string|null,receiver:string|null,debit:string,credit:string){
 const transactionId=randomUUID(),value=String(row.amount);
 await tx.query('INSERT INTO "Transaction" (id,"senderId","receiverId",amount,type,"idempotencyKey") VALUES ($1,$2,$3,$4,$5,$6)',[transactionId,sender,receiver,value,type,'wallet:'+row.id]);
 await tx.query('INSERT INTO "LedgerEntry" (id,"transactionId","accountId",amount) VALUES ($1,$2,$3,-$4::numeric),($5,$2,$6,$4::numeric)',[randomUUID(),transactionId,debit,value,randomUUID(),credit]);
 await tx.query('UPDATE "Transaction" SET status=\'COMPLETED\' WHERE id=$1',[transactionId]);
 const {rows:[result]}=await tx.query('UPDATE "WalletOperation" SET state=\'COMPLETED\',"transactionId"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[row.id,transactionId]);return operation(result);
}
export function transferWallet(db:WalletDb,c:Command&{recipientId:string;feeAccountId:string}){
 const recipient=id(c.recipientId),owner=id(c.ownerId),treasury=id(c.feeAccountId),quote=internalTransferQuote(c.amount);if(owner===recipient)throw Error('SELF_TRANSFER');
 return transact(db,async tx=>{
  const row=await begin(tx,c,'TRANSFER',recipient,null,null,{fee:quote.fee,accountId:treasury});if(row.state==='COMPLETED')return operation(row);
  const a=await accounts(tx,[owner,recipient],treasury),from=a.get(owner)!;
  if(await available(tx,owner,String(from.balance))<moneyMicros(quote.totalDebit))throw Error('INSUFFICIENT_AVAILABLE_BALANCE');
  const transactionId=randomUUID();
  // The declared journal amount equals TOTAL sender debit, matching positive postings.
  // The operation amount remains the recipient principal, with an explicit separate fee.
  await tx.query('INSERT INTO "Transaction" (id,"senderId","receiverId",amount,type,"idempotencyKey") VALUES ($1,$2,$3,$4,\'P2P\',$5)',[transactionId,owner,recipient,quote.totalDebit,'wallet:'+row.id]);
  await tx.query('INSERT INTO "LedgerEntry" (id,"transactionId","accountId",amount) VALUES ($1,$2,$3,-$4::numeric),($5,$2,$6,$7::numeric),($8,$2,$9,$10::numeric)',[randomUUID(),transactionId,String(from.id),quote.totalDebit,randomUUID(),String(a.get(recipient)!.id),quote.amount,randomUUID(),treasury,quote.fee]);
  await tx.query('UPDATE "Transaction" SET status=\'COMPLETED\' WHERE id=$1',[transactionId]);
  const {rows:[result]}=await tx.query('UPDATE "WalletOperation" SET state=\'COMPLETED\',"transactionId"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[row.id,transactionId]);return operation(result);
 });
}
/** ONLY a trusted settlement adapter may call this, after finality, asset/network, beneficiary
 * and valuation verification. amount is settled USD, NOT an assumed USDT/USDC 1:1 conversion.
 * providerReference must include provider+network+event/log index, never just a transaction hash.
 */
export function creditConfirmedDeposit(db:WalletDb,c:Command&{providerReference:string;settlementAccountId:string}){
 const external=reference(c.providerReference),owner=id(c.ownerId);
 return transact(db,async tx=>{
  const row=await begin(tx,c,'DEPOSIT',null,null,external);if(row.state==='COMPLETED')return operation(row);
  const a=await accounts(tx,[owner],c.settlementAccountId);
  return post(tx,row,'DEPOSIT',null,owner,id(c.settlementAccountId),String(a.get(owner)!.id));
 });
}
export function reserveWithdrawal(db:WalletDb,c:Command&{destination:string}){
 const destination=reference(c.destination),owner=id(c.ownerId);
 return transact(db,async tx=>{
  const row=await begin(tx,c,'WITHDRAWAL',null,destination);if(row.state!=='PENDING')return operation(row);
  const a=await accounts(tx,[owner]);if(await available(tx,owner,String(a.get(owner)!.balance))<moneyMicros(String(row.amount)))throw Error('INSUFFICIENT_AVAILABLE_BALANCE');
  const {rows:[reserved]}=await tx.query('UPDATE "WalletOperation" SET state=\'RESERVED\',"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[row.id]);return operation(reserved);
 });
}
/** Mark BEFORE initiating a provider request, using operationId as provider idempotency key.
 * Crash/timeouts stay SUBMITTED and held until a reconciler obtains definitive evidence.
 */
export function submitWithdrawal(db:WalletDb,operationId:string){return transact(db,async tx=>{
 const {rows:[row]}=await tx.query('SELECT * FROM "WalletOperation" WHERE id=$1 AND kind=\'WITHDRAWAL\' FOR UPDATE',[id(operationId)]);if(!row)throw Error('OPERATION_UNAVAILABLE');
 await accounts(tx,[String(row.ownerId)]);
 if(row.state==='RESERVED'){const {rows:[updated]}=await tx.query('UPDATE "WalletOperation" SET state=\'SUBMITTED\',"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[row.id]);return operation(updated)}
 return operation(row);
})}
/** Private provider reconciliation only; NEVER accept a customer-supplied "confirmed" flag. */
export function settleWithdrawal(db:WalletDb,operationId:string,evidence:{outcome:'confirmed'|'rejected';providerReference:string;settlementAccountId:string}){
 const external=reference(evidence.providerReference);if(!['confirmed','rejected'].includes(evidence.outcome))throw Error('INVALID_OUTCOME');
 return transact(db,async tx=>{
  const {rows:[row]}=await tx.query('SELECT * FROM "WalletOperation" WHERE id=$1 AND kind=\'WITHDRAWAL\' FOR UPDATE',[id(operationId)]);if(!row)throw Error('OPERATION_UNAVAILABLE');
  if(['COMPLETED','FAILED'].includes(String(row.state))){if(row.externalReference!==external||(row.state==='COMPLETED')!==(evidence.outcome==='confirmed'))throw Error('SETTLEMENT_CONFLICT');return operation(row)}
  if(row.state!=='SUBMITTED')throw Error('WITHDRAWAL_NOT_SUBMITTED');
  const owner=String(row.ownerId),a=await accounts(tx,[owner],evidence.settlementAccountId);
  await tx.query('UPDATE "WalletOperation" SET "externalReference"=$2 WHERE id=$1',[row.id,external]);
  if(evidence.outcome==='rejected'){
   const {rows:[failed]}=await tx.query('UPDATE "WalletOperation" SET state=\'FAILED\',"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[row.id]);return operation(failed);
  }
  const balance=String(a.get(owner)!.balance);if(await available(tx,owner,balance,String(row.id))<moneyMicros(String(row.amount)))throw Error('INSUFFICIENT_AVAILABLE_BALANCE');
  return post(tx,row,'WITHDRAWAL',owner,null,String(a.get(owner)!.id),id(evidence.settlementAccountId));
 });
}
export function walletBalances(db:WalletDb,ownerId:string){return transact(db,async tx=>{
 const owner=id(ownerId),a=await accounts(tx,[owner]);const posted=String(a.get(owner)!.balance),spendable=await available(tx,owner,posted);
 return {currency:'USD',posted:moneyString(moneyMicros(posted)),available:moneyString(spendable),held:moneyString(moneyMicros(posted)-spendable)};
})}
