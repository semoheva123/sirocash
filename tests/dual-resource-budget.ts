import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {HDKey} from '@scure/bip32';
import {deriveTronDepositAddress} from '../lib/tron-addresses';
import {prepareTronResourceIntent} from '../lib/tron-resource-intent';
import {purchaseIntentEnergy} from '../lib/energy-purchase';
import {nativeExpenseUsage} from '../lib/native-expense-usage';
import {dualResourceProvider} from '../lib/dual-resource-provider';
import {tronRentalOrderClient} from '../lib/tronrental-orders';
import type {WalletDb} from '../lib/wallet-engine';
type Query=(sql:string,params?:unknown[])=>Promise<{rows:any[]}>;
/** Same acceptance runs on PGlite and real multi-session PostgreSQL. Synthetic paid boundary only. */
export async function dualResourceBudgetAcceptance(query:Query,db:WalletDb){
 const account=HDKey.fromMasterSeed(new Uint8Array(32).fill(73)).derive("m/44'/195'/0'"),vault=randomUUID();
 await query('INSERT INTO "DepositAddressVault"(id,network,"accountXpub",enabled,"originVerified") VALUES($1,\'TRC20\',$2,true,true)',[vault,account.publicExtendedKey]);
 const intents:{id:string;sender:string;fingerprint:string}[]=[];
 for(let n=0;n<4;n++){
  const owner=randomUUID(),addressId=randomUUID(),sender=deriveTronDepositAddress(account.publicExtendedKey,n).address;
  await query('INSERT INTO "User"(id,email) VALUES($1,$2)',[owner,owner+'@example.test']);
  await query('INSERT INTO "UserDepositAddress"(id,"ownerId","vaultId",network,address,"derivationIndex") VALUES($1,$2,$3,\'TRC20\',$4,$5)',[addressId,owner,vault,sender,n]);
  const intent=await prepareTronResourceIntent(db,{kind:'SWEEP',addressId,requestKey:'fixture:dual:'+n,amountBaseUnits:100000000n,energyAmount:65000,bandwidthAmount:500,durationMinutes:60,maxRentalSun:3000000n});
  const {rows:[row]}=await query('SELECT fingerprint FROM "EnergyRentalIntent" WHERE id=$1',[intent.id]);intents.push({id:intent.id,sender,fingerprint:row.fingerprint});
 }
 const {rows:[prior]}=await query('SELECT COALESCE(sum("costSun"),0)::text AS total FROM "EnergyPurchaseAttempt"');
 const existing=BigInt(prior.total),usage=await db.transaction(async tx=>{await tx.query('SELECT network FROM "PayoutExpensePolicy" WHERE network=\'TRC20\' FOR UPDATE');return nativeExpenseUsage(tx,'TRC20')});
 await query('UPDATE "EnergyPurchasePolicy" SET enabled=true,"perOrderSun"=2500000,"totalHeldSun"=$1 WHERE id=1',[(existing+2600000n).toString()]);
 await query('UPDATE "PayoutExpensePolicy" SET enabled=true,"perPayoutCap"=2600000,"dailyCap"=$1 WHERE network=\'TRC20\'',[(usage+2600000n).toString()]);
 let energyPosts=0,bwPosts=0;
 const client=dualResourceProvider(db,{enabled:true,energy:{quote:async()=>({costSun:2000000n,expiresAt:Date.now()+25000}),send:async()=>{energyPosts++;return {orderId:'fixture:'+randomUUID()}},check:async()=>{throw Error('not delivered')}},bandwidth:tronRentalOrderClient({key:'fixture',enabled:true,assertActive:async()=>{},fetch:async(input,init)=>{
  const u=new URL(String(input));
  if(init?.method==='GET')return Response.json({volume:500,duration:'1h',personal_price:false,rental_trx:'0.4',fixed_fee_trx:'0.2',total_trx:'0.6'});
  assert.equal(u.pathname,'/v1/bandwidth/buy');bwPosts++;
  const claim=new Headers(init?.headers).get('Idempotency-Key');
  const {rows}=await query('SELECT l.*,a."costSun" FROM "ResourcePurchaseLeg" l JOIN "EnergyPurchaseAttempt" a ON a."claimId"=l."claimId" WHERE l."claimId"=(SELECT "claimId" FROM "ResourcePurchaseLeg" WHERE "requestKey"=$1)',[claim]);
  assert.equal(rows.length,2,'both legs must be committed and visible in another transaction before POST');assert.equal(BigInt(rows[0].costSun),2600000n);
  return Response.json({id:900001,status:'pending',price_trx:'0.6',activation_cost_trx:'0',txid:null});
 }}),observe:async()=>{throw Error('not delivered')}});
 const signal=new AbortController().signal;
 async function buy(n:number,broken=false){const i=intents[n],o={requestKey:randomUUID(),sender:i.sender,energyAmount:65000,bandwidthAmount:500,durationMinutes:60 as const,maxCostSun:3000000n,signal},q=await client.quote(o);
  return purchaseIntentEnergy(db,i.id,{sender:i.sender,energyAmount:65000,bandwidthAmount:500,durationMinutes:60,costSun:q.costSun,expiresAt:q.expiresAt,intentFingerprint:i.fingerprint},{enabled:true,send:client.send,reserve:async(tx,claimId)=>{await client.reserve!(tx,{...o,requestKey:claimId,maxCostSun:q.costSun},q);if(broken)throw Error('fixture-plan-failed')}});
 }
 await assert.rejects(buy(0),/ORDER_BUDGET/);assert.equal(bwPosts,0);assert.equal(energyPosts,0);
 await query('UPDATE "EnergyPurchasePolicy" SET "perOrderSun"=2600000 WHERE id=1');
 await assert.rejects(buy(0,true),/fixture-plan-failed/);
 assert.equal((await query('SELECT 1 FROM "EnergyPurchaseAttempt" WHERE "intentId"=$1',[intents[0].id])).rows.length,0,'failed child planning rolls back parent reservation');
 const race=await Promise.allSettled([buy(0),buy(1)]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(bwPosts,1);assert.equal(energyPosts,1);
 const winner=race[0].status==='fulfilled'?0:1;
 await buy(winner);assert.equal(bwPosts,1);assert.equal(energyPosts,1);
 await query('UPDATE "EnergyPurchasePolicy" SET "totalHeldSun"=$1 WHERE id=1',[(existing+10000000n).toString()]);
 await assert.rejects(buy(2),/NETWORK_DAILY_CAP/);assert.equal(bwPosts,1);assert.equal(energyPosts,1);
 const {rows:[a]}=await query('SELECT * FROM "EnergyPurchaseAttempt" WHERE "intentId"=$1',[intents[winner].id]);
 for(const sql of ['UPDATE "ResourcePurchaseLeg" SET quantity=quantity+1 WHERE "claimId"=$1','UPDATE "ResourcePurchaseLeg" SET provider=\'other\' WHERE "claimId"=$1','UPDATE "ResourcePurchaseLeg" SET "quotedSun"=1 WHERE "claimId"=$1','DELETE FROM "ResourcePurchaseLeg" WHERE "claimId"=$1'])await assert.rejects(query(sql,[a.claimId]));
 assert.equal((await query('SELECT count(*)::int AS n FROM "ResourcePurchaseLeg" WHERE "claimId"=$1',[a.claimId])).rows[0].n,2);
 assert.equal(await db.transaction(async tx=>{await tx.query('SELECT network FROM "PayoutExpensePolicy" WHERE network=\'TRC20\' FOR UPDATE');return nativeExpenseUsage(tx,'TRC20')}),usage+2600000n);
 console.log('Dual budget acceptance PASS: combined cap before either POST, atomic rollback, competing intents share one budget, visible committed child claims, replay/no duplicate, immutable legs and exact network usage');
}
