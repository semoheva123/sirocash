import type {WalletTx} from './wallet-engine';
import {z} from 'zod';
import {readPendingPage} from './financial-pending-page';
const cursor=z.object({at:z.iso.datetime({offset:true}),id:z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)}).strict();
export const historyRequest=z.object({scope:z.enum(['activity','deposits','withdrawals','operation','pending']),before:cursor.optional(),id:z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i).optional(),q:z.string().trim().min(1).max(80).optional(),type:z.enum(['P2P','DEPOSIT','WITHDRAWAL']).optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),network:z.enum(['TRC20','BEP20']).optional()}).strict().refine(v=>(!v.id||!v.before)&&(v.scope!=='operation'||Boolean(v.id)));
export type HistoryRequest=z.infer<typeof historyRequest>;
/** Read-only keyset page. Owner ALWAYS comes from the authenticated session, never query JSON. */
export async function readFinancialHistoryPage(tx:WalletTx,owner:string,input:HistoryRequest):Promise<Record<string,unknown>>{
 if(input.scope==='pending')return readPendingPage(tx,owner,input);
 if(input.scope==='operation'){const {rows:[row]}=await tx.query(`SELECT kind,"transactionId" FROM "WalletOperation" WHERE id=$2::uuid AND ("ownerId"=$1 OR (kind='TRANSFER' AND "counterpartyId"=$1)) LIMIT 1`,[owner,input.id]);return {userId:owner,resolved:row?(row.kind==='WITHDRAWAL'?{scope:'withdrawals',id:input.id}:row.transactionId?{scope:'activity',id:row.transactionId}:null):null}}
 const params:unknown[]=[owner],alias=input.scope==='activity'?'t':input.scope==='deposits'?'d':'w';
 let boundary='';
 if(input.before){params.push(input.before.at,input.before.id);boundary=` AND (${alias}."createdAt",${alias}.id)<($2::timestamptz,$3::uuid)`}
 if(input.id){params.push(input.id);boundary=` AND ${alias}.id=$2::uuid`}
 const bind=(value:unknown)=>{params.push(value);return '$'+params.length};
 if(input.from)boundary+=` AND ${alias}."createdAt">=${bind(input.from)}::date`;
 if(input.to)boundary+=` AND ${alias}."createdAt"<(${bind(input.to)}::date+INTERVAL '1 day')`;
 if(input.type){if(input.scope==='activity')boundary+=` AND t.type::text=${bind(input.type)}`;else if((input.scope==='deposits'&&input.type!=='DEPOSIT')||(input.scope==='withdrawals'&&input.type!=='WITHDRAWAL'))boundary+=' AND false'}
 if(input.network)boundary+=input.scope==='activity'?` AND COALESCE(q.network,d.network)=${bind(input.network)}`:input.scope==='deposits'?` AND d.network=${bind(input.network)}`:` AND COALESCE(p.network,q.network)=${bind(input.network)}`;
 if(input.q){const field=input.scope==='activity'?`concat_ws(' ',t.id::text,s.uid,s."displayName",s.username,r.uid,r."displayName",r.username,p."txId",p.sender,p.recipient,d."txId",d.sender,da.address)`:input.scope==='deposits'?`concat_ws(' ',d.id::text,d."txId",d.sender,a.address)`: `concat_ws(' ',w.id::text,p."txId",p.sender,p.recipient,q.recipient)`;boundary+=` AND strpos(lower(${field}),lower(${bind(input.q)}))>0`}
 let sql:string;
 if(input.scope==='activity')sql=`SELECT t.id,e.amount::text,t.type,t.status,t."createdAt",s.uid AS "senderUid",s."displayName" AS "senderName",s.username AS "senderUsername",r.uid AS "recipientUid",r."displayName" AS "recipientName",r.username AS "recipientUsername",CASE WHEN t.type='DEPOSIT' THEN v."inboxId" WHEN t.type='WITHDRAWAL' THEN w.id END AS "relatedId",COALESCE(q.network,d.network) AS network,concat_ws(' ',p."txId",p.sender,p.recipient,d."txId",d.sender,da.address) AS "searchText" FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a.id=e."accountId" JOIN "Transaction" t ON t.id=e."transactionId" LEFT JOIN "ReceivingIdentity" s ON t.type='P2P' AND s."userId"=t."senderId" LEFT JOIN "ReceivingIdentity" r ON t.type='P2P' AND r."userId"=t."receiverId" LEFT JOIN "WalletOperation" w ON w."transactionId"=t.id AND w."ownerId"=$1 LEFT JOIN "ApprovedDepositValuation" v ON t.type='DEPOSIT' AND v."operationId"=w.id LEFT JOIN "ChainDepositInbox" d ON d.id=v."inboxId" LEFT JOIN "UsdtWithdrawalQuote" q ON q."operationId"=w.id AND q."ownerId"=w."ownerId" LEFT JOIN "SignedWithdrawalOutbox" p ON p."operationId"=w.id LEFT JOIN "UserDepositAddress" da ON da.id=d."addressId" AND da.network=d.network AND da."ownerId"=$1 WHERE a."userId"=$1 AND a."accountType"='USER' AND a.currency='USD'${boundary} ORDER BY t."createdAt" DESC,t.id DESC LIMIT 31`;
 else if(input.scope==='deposits')sql=`SELECT d.id,d.network,d."txId",d."amountBaseUnits"::text,d.state,d."createdAt",d.sender,a.address AS recipient FROM "ChainDepositInbox" d JOIN "UserDepositAddress" a ON a.id=d."addressId" AND a.network=d.network WHERE a."ownerId"=$1${boundary} ORDER BY d."createdAt" DESC,d.id DESC LIMIT 31`;
 else sql=`SELECT w.id,w.kind,w.amount::text,w."feeAmount"::text,w.state,w."createdAt",q.network,q.recipient,q."grossTokens"::text,q."feeTokens"::text,q."netTokens"::text,p.id AS "payoutId",p.network AS "payoutNetwork",p.sender AS "payoutSender",p.recipient AS "payoutRecipient",p."amountBaseUnits"::text AS "payoutAmount",p."txId" AS "payoutTxId",p.state AS "payoutState",p."createdAt" AS "payoutCreatedAt" FROM "WalletOperation" w LEFT JOIN "UsdtWithdrawalQuote" q ON q."operationId"=w.id AND q."ownerId"=w."ownerId" LEFT JOIN "SignedWithdrawalOutbox" p ON p."operationId"=w.id WHERE w."ownerId"=$1 AND w.kind='WITHDRAWAL'${boundary} ORDER BY w."createdAt" DESC,w.id DESC LIMIT 31`;
 const {rows}=await tx.query(sql,params),page=rows.slice(0,30),last=page.at(-1);
 const next=rows.length>30&&last?{at:new Date(String(last.createdAt)).toISOString(),id:String(last.id)}:null;
 const data:Record<string,unknown>={userId:owner,next};
 if(input.scope==='activity')data.activity=page;
 else if(input.scope==='deposits')data.deposits=page;
 else{
  data.operations=page.map(({payoutId,payoutNetwork,payoutSender,payoutRecipient,payoutAmount,payoutTxId,payoutState,payoutCreatedAt,...operation})=>{void payoutId;void payoutNetwork;void payoutSender;void payoutRecipient;void payoutAmount;void payoutTxId;void payoutState;void payoutCreatedAt;return operation});
  data.payouts=page.filter(r=>r.payoutId).map(r=>({id:r.payoutId,operationId:r.id,network:r.payoutNetwork,sender:r.payoutSender,recipient:r.payoutRecipient,amountBaseUnits:r.payoutAmount,txId:r.payoutTxId,state:r.payoutState,createdAt:r.payoutCreatedAt}));
 }
 return data;
}
