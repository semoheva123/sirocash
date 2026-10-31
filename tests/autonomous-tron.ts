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
import {tronZapOrderClient} from '../lib/tronzap-orders';
import {createUnsentTronRenewal} from '../lib/unsent-tron-renewal';
import {prepareSignedSweep} from '../lib/signed-sweep-outbox';
import {deriveTronDepositAddress} from '../lib/tron-addresses';
import {treasuryDestination} from '../lib/treasury-addresses';
import {createTronRead} from '../lib/tron-receipt-observer';
import {createChainBroadcaster} from '../lib/chain-broadcast';
import {processSweepObservation} from '../lib/sweep-network-observer';
import {tronUsdtContract} from '../lib/tron-deposit-verification';
import type {WalletDb} from '../lib/wallet-engine';
async function scenario(bundle:boolean){const pg=new PGlite();try{
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
 let delivered=false,created=0,broadcasts=0,claim='',payload:Record<string,unknown>|undefined;
 const result=(v:unknown)=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
 const provider=(async(url,init)=>{
  const path=new URL(String(url)).pathname,p=JSON.parse(String(init?.body));
  if(path.endsWith('/services'))return result({code:0,result:{bandwidth:[{duration:1,min_amount:1000,max_amount:10000,price:'1'}]}});
  if(path.endsWith('calculate'))return result({code:0,result:{address:source,type:'energy',amount:65000,duration:1,price:'3.85',activation_fee:'0',total:'3.85'}});
  if(path.endsWith('/new')){created++;claim=p.external_id;assert.equal(p.params.address,source);assert.equal(p.params.amounts.energy,65000);assert.equal(p.service,bundle?'resource_bundle':'energy');assert.equal(p.params.amounts.bandwidth,bundle?1000:undefined)}
  if(path.endsWith('/check'))assert.equal(p.external_id,claim);
  return result({code:0,result:{id:'fixture-energy',external_id:claim,service:bundle?'resource_bundle':'energy',params:{address:source,duration:1,amounts:{energy:65000,...(bundle?{bandwidth:1000}:{})}},status:delivered?'success':'pending',amount:bundle?'4.85':'3.85',hash:delivered?delegation:''}});
 }) as typeof fetch;
 const topicAddress=(a:string)=>TronWeb.address.toHex(a).slice(2).padStart(64,'0');
 const log={address:TronWeb.address.toHex(tronUsdtContract).slice(2),topics:['ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topicAddress(source),topicAddress(to)],data:(100000000n).toString(16).padStart(64,'0')};
 const chain=(async(url,init)=>{
  const path=new URL(String(url)).pathname,p=JSON.parse(String(init?.body));
  if(path.endsWith('getaccountresource'))return result({EnergyLimit:delivered?65000:0,freeNetLimit:bundle?0:600,NetLimit:bundle&&delivered?1000:0});
  if(path.endsWith('getaccount'))return result({address:senderHex,balance:0});
  if(path.endsWith('triggerconstantcontract'))return result({result:{result:true},constant_result:[(100000000n).toString(16).padStart(64,'0')]});
  if(path.endsWith('estimateenergy'))return result({result:{result:true},energy_required:65000});
  if(path==='/wallet/getnowblock')return result({blockID:blockId,block_header:{raw_data:{number:100,timestamp:Date.now()-1000}}});
  if(path.endsWith('getnowblock'))return result({blockID:'0000000000000069'+'cd'.repeat(24),block_header:{raw_data:{number:105,timestamp:Date.now()-1000}}});
  if(path.endsWith('gettransactioninfobyid'))return result(p.value===delegation?{id:delegation,blockNumber:100}:{id:payload?.txID,blockNumber:100,receipt:{result:'SUCCESS'},log:[log]});
  if(path.endsWith('getblockbynum')){
   if(p.num===0)return result({blockID:genesis,block_header:{raw_data:{number:0}}});
   return result({blockID:blockId,block_header:{raw_data:{number:100}},transactions:[{txID:delegation,ret:[{contractRet:'SUCCESS'}],raw_data:{contract:[{type:'DelegateResourceContract',parameter:{value:{resource:bundle?'BANDWIDTH':'ENERGY',balance:1000000,receiver_address:senderHex}}}]}},...(payload?[{...payload,ret:[{contractRet:'SUCCESS'}]}]:[])]});
  }
  if(path.endsWith('broadcasttransaction')){payload=p;broadcasts++;return result({result:true,txid:p.txID})}
  throw Error('Unexpected fixture path '+path);
 }) as typeof fetch;
 const tron={endpoint:'https://tron.example.invalid',fetch:chain},bep20={endpoint:'https://bsc.example.invalid',fetch:chain};
 const client=tronZapOrderClient({credentials:{token:'fixture-token',secret:'fixture-secret'},purchaseEnabled:true,acceptVariableProviderPrice:true,fetch:provider});
 const execution=createFinancialExecution(db,{purchaseEnabled:true,client,delivery:createEnergyDeliveryObserver({...tron,genesisId:genesis}),resources:createOutboxResourceObserver({bep20,tron,tronGenesisId:genesis})});
 const preparation=createFinancialPreparation(db,{enabled:true,bandwidthPackage:client.bandwidthPackage,preflight:createFinancialPreflight({bep20,tron,genesisId:genesis,tronReadOwner:to}),gas:{prepare:async()=>{throw Error('No BNB')},process:async()=>{throw Error('No BNB')}},energy:execution.energy,limits:()=>({maxAmount:1000000000n,maxFee:4000000n,minimumSweep:1000000n}),signSweep:(d,c)=>prepareSignedSweep(d,c,{loadKeys:()=>({accountXpub:account.publicExtendedKey,accountXprv:account.privateExtendedKey})})});
 const signal=new AbortController().signal,job={kind:'PREPARE_SWEEP' as const,id};
 assert.equal((await preparation(job,signal)).state,'HELD');assert.equal(created,1);assert.equal(broadcasts,0);
 assert.equal((await preparation(job,signal)).state,'HELD');assert.equal(created,1);
 delivered=true;const saved=await preparation(job,signal);assert.equal(saved.state,'SAVED');if(saved.state!=='SAVED')throw Error('not saved');
 assert.equal(created,1);assert.equal((await execution.authorize({id:saved.id,kind:'SWEEP',createdAt:new Date().toISOString()},signal)).state,'RESERVED');
 const observer={enabled:true,dispatchEnabled:true,send:createChainBroadcaster({enabled:true,bep20,tron,tronGenesisId:genesis}),bep20:async()=>{throw Error('No BNB')},tron:createTronRead(tron),tronGenesisId:genesis,minimumBep20Confirmations:15};
 assert.equal((await processSweepObservation(db,saved.id,observer)).state,'CONFIRMED');assert.equal(broadcasts,1);
 assert.equal((await processSweepObservation(db,saved.id,observer)).state,'CONFIRMED');assert.equal(broadcasts,1);assert.equal(created,1);
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
 assert.equal(created,1);assert.equal(broadcasts,1);
 assert.equal((await pg.query<{bandwidthAmount:number}>('SELECT "bandwidthAmount" FROM "EnergyRentalIntent"')).rows[0].bandwidthAmount,bundle?1000:0);
 console.log((bundle?'Bundled energy + bandwidth: ':'Energy-only: ')+ 'Autonomous TRON fixture cycle: unsigned simulation -> exact resource intent -> one paid-order fixture -> pending recovery without repurchase -> solid ENERGY delivery -> fresh HD signing -> resource/cost authorization with zero native prefund -> broadcast -> final exact Transfer/replay passed. No real paid calls.');
}finally{await pg.close()}}
async function main(){await scenario(false);await scenario(true)}
main().catch(e=>{console.error(e);process.exitCode=1});
