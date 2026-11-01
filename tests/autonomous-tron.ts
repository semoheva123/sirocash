import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {HDKey} from '@scure/bip32';
import {TronWeb} from 'tronweb';
import {createFinancialPreparation} from '../lib/financial-preparation';
import {createFinancialPreflight} from '../lib/financial-preflight';
import {createFinancialExecution} from '../lib/financial-execution';
import {createOutboxResourceObserver} from '../lib/outbox-resource-observer';
import {createEnergyDeliveryObserver} from '../lib/energy-delivery-observer';
import {dualResourceProvider} from '../lib/dual-resource-provider';
import {tronRentalOrderClient} from '../lib/tronrental-orders';
import {createTronActiveAccountProof} from '../lib/tron-active-account';
import {catFeeOrderClient} from '../lib/catfee-orders';
import type {ResourceProvider} from '../lib/resource-provider';
import {createUnsentTronRenewal} from '../lib/unsent-tron-renewal';
import {prepareSignedSweep} from '../lib/signed-sweep-outbox';
import {deriveTronDepositAddress} from '../lib/tron-addresses';
import {treasuryDestination} from '../lib/treasury-addresses';
import {createTronRead} from '../lib/tron-receipt-observer';
import {createChainBroadcaster} from '../lib/chain-broadcast';
import {processSweepObservation} from '../lib/sweep-network-observer';
import {tronUsdtContract} from '../lib/tron-deposit-verification';
import type {WalletDb} from '../lib/wallet-engine';
async function scenario(bundle:boolean,direct=false,dual=false,energyPresent=false,fault=''){const pg=new PGlite();try{
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
 for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
 const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
 const account=HDKey.fromMasterSeed(new Uint8Array(32).fill(32)).derive("m/44'/195'/0'"),source=deriveTronDepositAddress(account.publicExtendedKey,0).address;
 const owner='00000000-0000-0000-0000-000000000001',vault='00000000-0000-0000-0000-000000000002',id='00000000-0000-0000-0000-000000000003',senderHex=TronWeb.address.toHex(source),to=treasuryDestination('TRC20','operating');
 await pg.query('INSERT INTO "User"(id,email) VALUES($1,\'autonomous-tron@example.test\')',[owner]);
 await pg.query('INSERT INTO "DepositAddressVault"(id,network,"accountXpub",enabled,"originVerified") VALUES($1,\'TRC20\',$2,true,true)',[vault,account.publicExtendedKey]);
 await pg.query('INSERT INTO "UserDepositAddress"(id,"ownerId","vaultId",network,address,"derivationIndex") VALUES($1,$2,$3,\'TRC20\',$4,0)',[id,owner,vault,source]);
 await pg.exec('UPDATE "PayoutExpensePolicy" SET enabled=true,"perPayoutCap"=10000000,"dailyCap"=50000000 WHERE network=\'TRC20\'; UPDATE "EnergyPurchasePolicy" SET enabled=true,"perOrderSun"=5000000,"totalHeldSun"=20000000');
 const genesis='0'.repeat(16)+'cd'.repeat(24),delegation='ab'.repeat(32),blockId='0000000000000064'+'cd'.repeat(24);
 const bandwidthTx='ef'.repeat(32);let bwCreated=0;
 let delivered=false,created=0,broadcasts=0,claim='',payload:Record<string,unknown>|undefined;
 const result=(v:unknown)=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
 const topicAddress=(a:string)=>TronWeb.address.toHex(a).slice(2).padStart(64,'0');
 const log={address:TronWeb.address.toHex(tronUsdtContract).slice(2),topics:['ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topicAddress(source),topicAddress(to)],data:(100000000n).toString(16).padStart(64,'0')};
 const chain=(async(url,init)=>{
  const path=new URL(String(url)).pathname,p=JSON.parse(String(init?.body));
  if(path.endsWith('getaccountresource'))return result({EnergyLimit:delivered||energyPresent?65000:0,freeNetLimit:fault==='split'?300:bundle?0:600,NetLimit:bundle&&delivered?1000:fault==='split'?200:0});
  if(path.endsWith('getaccount'))return result(fault==='inactive'?{}:{address:senderHex,balance:0});
  if(path.endsWith('triggerconstantcontract'))return result({result:{result:true},constant_result:[(100000000n).toString(16).padStart(64,'0')]});
  if(path.endsWith('estimateenergy'))return result({result:{result:true},energy_required:65000});
  if(path==='/wallet/getnowblock')return result({blockID:blockId,block_header:{raw_data:{number:100,timestamp:Date.now()-1000}}});
  if(path.endsWith('getnowblock'))return result({blockID:'0000000000000069'+'cd'.repeat(24),block_header:{raw_data:{number:105,timestamp:Date.now()-1000}}});
  if(path.endsWith('gettransactioninfobyid'))return result((p.value===delegation||p.value===bandwidthTx)?{id:p.value,blockNumber:100}:{id:payload?.txID,blockNumber:100,receipt:{result:'SUCCESS'},log:[log]});
  if(path.endsWith('getblockbynum')){
   if(p.num===0)return result({blockID:genesis,block_header:{raw_data:{number:0}}});
   return result({blockID:blockId,block_header:{raw_data:{number:100}},transactions:[{txID:delegation,ret:[{contractRet:'SUCCESS'}],raw_data:{contract:[{type:'DelegateResourceContract',parameter:{value:{resource:bundle&&!dual?'BANDWIDTH':'ENERGY',balance:1000000,receiver_address:senderHex}}}]}},...(dual?[{txID:bandwidthTx,ret:[{contractRet:'SUCCESS'}],raw_data:{contract:[{type:'DelegateResourceContract',parameter:{value:{resource:fault==='wrongproof'?'ENERGY':'BANDWIDTH',balance:1000000,receiver_address:senderHex}}}]}}]:[]),...(payload?[{...payload,ret:[{contractRet:'SUCCESS'}]}]:[])]});
  }
  if(path.endsWith('broadcasttransaction')){payload=p;broadcasts++;return result({result:true,txid:p.txID})}
  throw Error('Unexpected fixture path '+path);
 }) as typeof fetch;
 const tron={endpoint:'https://tron.example.invalid',fetch:chain},bep20={endpoint:'https://bsc.example.invalid',fetch:chain};
 // Provider-neutral domain fixture. This is NOT a live CatFee integration/price guarantee.
 const neutral:ResourceProvider={
  quote:async()=>({costSun:bundle?4850000n:3850000n,expiresAt:Date.now()+25000}),
  bandwidthPackage:async()=>1000,
  send:async o=>{created++;claim=o.requestKey;assert.equal(o.sender,source);assert.equal(o.energyAmount,65000);assert.equal(o.bandwidthAmount??0,bundle?1000:0);return {orderId:'fixture-energy'}},
  check:async o=>{assert.equal(o.requestKey,claim);return {orderId:'fixture-energy',status:delivered?'success':'pending',actualCostSun:bundle?4850000n:3850000n,priceExceeded:false,delegationTxId:delivered?delegation:undefined}},
 };
 const energyClient:ResourceProvider=direct||dual?catFeeOrderClient({credentials:{key:'fixture',secret:'fixture'},directRentalEnabled:true,fetch:async(url,init)=>{
  const u=new URL(String(url));assert.equal(u.origin,'https://api.catfee.io');
  if(u.pathname==='/v1/estimate'){assert.equal(init?.method,'GET');return result({code:0,data:3850000})}
  assert.equal(u.pathname,'/v1/order');
  if(init?.method==='POST'){created++;claim=u.searchParams.get('client_order_id')!;assert.equal(u.searchParams.get('receiver'),source);assert.equal(u.searchParams.get('quantity'),'65000');assert.equal(u.searchParams.get('activate'),'false')}
  else {assert.equal(init?.method,'GET');assert.equal(u.searchParams.get('client_order_id'),claim)}
  return result({code:0,data:{id:'fixture-energy',client_order_id:claim,receiver:source,resource_type:'ENERGY',quantity:65000,duration:1,pay_amount_sun:3850000,activate_amount_sun:0,status:'DELEGATE_SUCCESS',confirm_status:delivered?'DELEGATION_CONFIRMED':'UNCONFIRMED',delegate_hash:delegation}});
 }}):neutral;
 const client=dual?dualResourceProvider(db,{energy:energyClient,enabled:true,observe:createEnergyDeliveryObserver({...tron,genesisId:genesis}),bandwidth:tronRentalOrderClient({key:'fixture',enabled:true,assertActive:createTronActiveAccountProof({...tron,genesisId:genesis}),fetch:async(url,init)=>{
  const u=new URL(String(url));assert.equal(u.origin,'https://api.tronrental.com');assert.equal(new Headers(init?.headers).get('X-API-Key'),'fixture');assert.equal(init?.redirect,'error');
  if(u.pathname==='/v1/bandwidth/quote/me')return result({volume:fault==='split'?300:500,duration:'1h',personal_price:false,rental_trx:'0.4',fixed_fee_trx:'0.2',total_trx:'0.6'});
  if(u.pathname==='/v1/bandwidth/buy'){
   bwCreated++;assert.equal(init?.method,'POST');const body=JSON.parse(String(init?.body));assert.equal(body.max_price_trx,'0.600000');assert.equal(body.volume,fault==='split'?300:500);assert.equal(body.target_address,source);
   const rows=(await pg.query<any>('SELECT * FROM "ResourcePurchaseLeg"')).rows;assert.equal(rows.length,energyPresent?1:2);assert.equal(rows.find((r:any)=>r.resource==='BANDWIDTH').state,'UNKNOWN');assert.ok(new Headers(init?.headers).get('Idempotency-Key'));
   if(fault==='timeout')throw Error('fixture-secret');
   return result({id:7,status:'pending',price_trx:'0.6',activation_cost_trx:fault==='activation'?'1.2':'0',txid:null});
  }
  assert.equal(u.pathname,'/v1/orders/7');assert.equal(init?.method,'GET');
  return result({id:7,type:'bandwidth',target_address:source,volume:fault==='split'?300:500,duration:'1h',status:delivered?'filled':'pending',price_trx:'0.6',activation_cost_trx:null,delegate_txid:delivered?bandwidthTx:null});
 }})}):energyClient;
 const execution=createFinancialExecution(db,{purchaseEnabled:true,client,delivery:createEnergyDeliveryObserver({...tron,genesisId:genesis}),resources:createOutboxResourceObserver({bep20,tron,tronGenesisId:genesis})});
 const preparation=createFinancialPreparation(db,{enabled:true,bandwidthPackage:client.bandwidthPackage,preflight:createFinancialPreflight({bep20,tron,genesisId:genesis,tronReadOwner:to}),gas:{prepare:async()=>{throw Error('No BNB')},process:async()=>{throw Error('No BNB')}},energy:execution.energy,limits:()=>({maxAmount:1000000000n,maxFee:4000000n,minimumSweep:1000000n}),signSweep:(d,c)=>prepareSignedSweep(d,c,{loadKeys:()=>({accountXpub:account.publicExtendedKey,accountXprv:account.privateExtendedKey})})});
 const signal=new AbortController().signal,job={kind:'PREPARE_SWEEP' as const,id};
 if(direct&&bundle){
  await assert.rejects(()=>preparation(job,signal),/CATFEE_BANDWIDTH_EXECUTION_UNVERIFIED/);assert.equal(created,0);assert.equal(broadcasts,0);
  assert.equal((await pg.query('SELECT 1 FROM "EnergyPurchaseAttempt"')).rows.length,0);
  console.log('Direct CatFee fixture: insufficient Bandwidth stops before any purchase or broadcast; no native burn fallback.');return;
 }
 assert.equal((await preparation(job,signal)).state,'HELD');
 if(fault==='timeout'||fault==='inactive'||fault==='activation'){
  assert.equal(bwCreated,fault==='inactive'?0:1);assert.equal(created,0);assert.equal(broadcasts,0);
  await preparation(job,signal);assert.equal(bwCreated,fault==='inactive'?0:1);assert.equal(created,0);
  assert.equal((await pg.query<{state:string}>('SELECT state FROM "EnergyRentalIntent"')).rows[0].state,'UNCERTAIN');
  if(fault==='activation')assert.equal((await pg.query<{enabled:boolean}>('SELECT enabled FROM "EnergyPurchasePolicy"')).rows[0].enabled,false);
  console.log('Dual resource '+fault+': retained combined budget, no second POST, no signing/broadcast');return;
 }
 assert.equal(created,energyPresent?0:1);assert.equal(broadcasts,0);
 assert.equal((await preparation(job,signal)).state,'HELD');assert.equal(created,energyPresent?0:1);
 delivered=true;
 if(fault==='wrongproof'){assert.equal((await preparation(job,signal)).state,'HELD');assert.equal(broadcasts,0);console.log('Dual resource rejects wrong bandwidth delegation contract independently');return;}
 const saved=await preparation(job,signal);assert.equal(saved.state,'SAVED');if(saved.state!=='SAVED')throw Error('not saved');
 assert.equal(created,energyPresent?0:1);assert.equal((await execution.authorize({id:saved.id,kind:'SWEEP',createdAt:new Date().toISOString()},signal)).state,'RESERVED');
 const observer={enabled:true,dispatchEnabled:true,send:createChainBroadcaster({enabled:true,bep20,tron,tronGenesisId:genesis}),bep20:async()=>{throw Error('No BNB')},tron:createTronRead(tron),tronGenesisId:genesis,minimumBep20Confirmations:15};
 assert.equal((await processSweepObservation(db,saved.id,observer)).state,'CONFIRMED');assert.equal(broadcasts,1);
 assert.equal((await processSweepObservation(db,saved.id,observer)).state,'CONFIRMED');assert.equal(broadcasts,1);assert.equal(created,energyPresent?0:1);
 assert.equal((await pg.query<{state:string}>('SELECT state FROM "EnergyRentalIntent"')).rows[0].state,'DELIVERED');
 // A separate never-claimed expired sweep is renewed atomically without another rental.
 const owner2='00000000-0000-0000-0000-000000000004',id2='00000000-0000-0000-0000-000000000005',source2=deriveTronDepositAddress(account.publicExtendedKey,1).address;
 await pg.query('INSERT INTO "User"(id,email) VALUES($1,\'unsent@example.test\')',[owner2]);
 await pg.query(`INSERT INTO "UserDepositAddress"(id,"ownerId","vaultId",network,address,"derivationIndex") VALUES($1,$2,$3,'TRC20',$4,1)`,[id2,owner2,vault,source2]);
 const earlier=Date.now()-120000;
 const expired=await prepareSignedSweep(db,{network:'TRC20',addressId:id2,requestKey:'fixture:unsent:renew',maxAmountBaseUnits:1000000000n,maxNetworkFeeBaseUnits:4000000n,transaction:{amountBaseUnits:10000000n,refBlockBytes:'1234',refBlockHash:'ab'.repeat(8),timestamp:earlier,expiration:earlier+60000,feeLimitSun:4000000}},{now:earlier,loadKeys:()=>({accountXpub:account.publicExtendedKey,accountXprv:account.privateExtendedKey})});
 const renewal=createUnsentTronRenewal(db,{preflight:createFinancialPreflight({bep20,tron,genesisId:genesis,tronReadOwner:to}),loadDeposit:()=>({accountXpub:account.publicExtendedKey,accountXprv:account.privateExtendedKey})});
 assert.equal((await renewal({kind:'SWEEP',id:expired.id},signal)).state,'RENEWED');
 const changed=(await pg.query<{txId:string}>('SELECT "txId" FROM "SignedSweepOutbox" WHERE id=$1',[expired.id])).rows[0].txId;assert.notEqual(changed,expired.txId);
 assert.equal((await renewal({kind:'SWEEP',id:expired.id},signal)).state,'UNCHANGED');
 assert.equal((await pg.query('SELECT id FROM "DispatchApprovalHistory" WHERE "outboxId"=$1',[expired.id])).rows.length,1);
 assert.equal(created,energyPresent?0:1);assert.equal(broadcasts,1);
 assert.equal((await pg.query<{bandwidthAmount:number}>('SELECT "bandwidthAmount" FROM "EnergyRentalIntent"')).rows[0].bandwidthAmount,dual?(fault==='split'?300:500):bundle?1000:0);
 if(dual){assert.equal(bwCreated,1);assert.equal((await pg.query('SELECT 1 FROM "ResourcePurchaseLeg"')).rows.length,energyPresent?1:2);console.log('Dual real adapters '+(energyPresent?'bandwidth-only':'energy + bandwidth')+': combined committed reservation -> one POST/leg -> both independent solid proofs -> signing -> zero-TRX broadcast -> settlement PASS');}
 console.log((direct?'CatFee DIRECT adapter mock cycle (not live acceptance): ':bundle?'Bundled provider-neutral fixture: ':'Energy-only provider-neutral fixture: ')+ ' unsigned simulation -> exact resource intent -> one paid-order fixture -> pending recovery without repurchase -> solid ENERGY delivery -> fresh HD signing -> resource/cost authorization with zero native prefund -> broadcast -> final exact Transfer/replay passed. No real paid calls.');
}finally{await pg.close()}}
async function main(){await scenario(false);await scenario(true);await scenario(false,true);await scenario(true,true);await scenario(true,false,true);await scenario(true,false,true,true);await scenario(true,false,true,false,'timeout');await scenario(true,false,true,false,'inactive');await scenario(true,false,true,false,'wrongproof');await scenario(true,false,true,false,'activation');await scenario(true,false,true,false,'split')}
main().catch(e=>{console.error(e);process.exitCode=1});
