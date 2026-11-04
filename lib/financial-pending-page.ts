import type {WalletTx} from './wallet-engine';
import type {HistoryRequest} from './financial-history-page';
export async function readPendingPage(tx:WalletTx,owner:string,input:HistoryRequest){
 const params:unknown[]=[owner];const bind=(v:unknown)=>{params.push(v);return '$'+params.length};
 let where='';if(input.before)where+=` AND (x."createdAt",x.id)<(${bind(input.before.at)}::timestamptz,${bind(input.before.id)}::uuid)`;
 if(input.id)where+=` AND x.id=${bind(input.id)}::uuid`;
 if(input.from)where+=` AND x."createdAt">=${bind(input.from)}::date`;
 if(input.to)where+=` AND x."createdAt"<(${bind(input.to)}::date+INTERVAL '1 day')`;
 if(input.type)where+=` AND x.type=${bind(input.type)}`;
 if(input.network)where+=` AND x.network=${bind(input.network)}`;
 if(input.q)where+=` AND strpos(lower(concat_ws(' ',x.id::text,x."searchText")),lower(${bind(input.q)}))>0`;
 const {rows}=await tx.query(`SELECT * FROM (
 SELECT w.id,w."createdAt",CASE WHEN w.kind='TRANSFER' THEN 'P2P' ELSE w.kind END AS type,w.state AS status,(-w.amount)::text AS amount,'USD' AS currency,q.network,CASE WHEN w.kind='WITHDRAWAL' THEN 'withdrawals' ELSE 'operation' END AS "recordScope",w.id AS "recordId",NULL::text AS "amountBaseUnits",concat_ws(' ',q.recipient,s.uid,s."displayName",r.uid,r."displayName") AS "searchText" FROM "WalletOperation" w LEFT JOIN "UsdtWithdrawalQuote" q ON q."operationId"=w.id AND q."ownerId"=w."ownerId" LEFT JOIN "ReceivingIdentity" s ON w.kind='TRANSFER' AND s."userId"=w."ownerId" LEFT JOIN "ReceivingIdentity" r ON w.kind='TRANSFER' AND r."userId"=w."counterpartyId" WHERE w."ownerId"=$1 AND w.kind<>'DEPOSIT' AND w.state IN ('PENDING','RESERVED','SUBMITTED')
 UNION ALL
 SELECT d.id,d."createdAt",'DEPOSIT',d.state,NULL::text,'USDT',d.network,'deposits',d.id,d."amountBaseUnits"::text,concat_ws(' ',d."txId",d.sender,a.address) FROM "ChainDepositInbox" d JOIN "UserDepositAddress" a ON a.id=d."addressId" AND a.network=d.network WHERE a."ownerId"=$1 AND d.state<>'CREDITED'
 ) x WHERE true${where} ORDER BY x."createdAt" DESC,x.id DESC LIMIT 31`,params);
 const page=rows.slice(0,30).map(row=>{
  if(row.currency==='USDT'){
   const decimals=row.network==='TRC20'?6:18,scale=10n**BigInt(decimals),value=BigInt(String(row.amountBaseUnits)),fraction=String(value%scale).padStart(decimals,'0').replace(/0+$/,'');row.amount=`${value/scale}${fraction?'.'+fraction:''}`;
  }
  delete row.amountBaseUnits;return row;
 });
 const last=page.at(-1);return {userId:owner,activity:page,next:rows.length>30&&last?{at:new Date(String(last.createdAt)).toISOString(),id:last.id}:null};
}
