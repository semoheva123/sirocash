import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {HDKey} from '@scure/bip32';
import {Wallet,Transaction,Interface} from 'ethers';
import {createFinancialPreparation} from '../lib/financial-preparation';
import {createFinancialPreflight} from '../lib/financial-preflight';
import {createNativeGasWorker} from '../lib/native-gas';
import {authorizeSweepDispatch} from '../lib/sweep-dispatch';
import {createFinancialExecution} from '../lib/financial-execution';
import {createOutboxResourceObserver} from '../lib/outbox-resource-observer';
import {prepareSignedSweep} from '../lib/signed-sweep-outbox';
import {createBep20ReadRpc} from '../lib/bep20-rpc';
import {createChainBroadcaster} from '../lib/chain-broadcast';
import {processSweepObservation} from '../lib/sweep-network-observer';
import {deriveBep20DepositAddress} from '../lib/evm-deposit-addresses';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
import {treasuryDestination} from '../lib/treasury-addresses';
import type {WalletDb} from '../lib/wallet-engine';
async function main(){const pg=new PGlite();try{
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
 for(const dir of (await readdir('prisma/migrations')).sort())if(!dir.endsWith('.toml'))await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
 const db:WalletDb={transaction:run=>pg.transaction(tx=>run({query:async(sql,params)=>({rows:(await tx.query(sql,params)).rows as Record<string,unknown>[]})}))};
 const account=HDKey.fromMasterSeed(new Uint8Array(32).fill(31)).derive("m/44'/60'/0'"),key='03'.repeat(32),parent=new Wallet(key).address;
 const owner='00000000-0000-0000-0000-000000000001',vault='00000000-0000-0000-0000-000000000002',addressId='00000000-0000-0000-0000-000000000003',source=deriveBep20DepositAddress(account.publicExtendedKey,0).address;
 await pg.query('INSERT INTO "User"(id,email) VALUES($1,\'autonomous@example.test\')',[owner]);
 await pg.query('INSERT INTO "DepositAddressVault"(id,network,"accountXpub",enabled,"originVerified") VALUES($1,\'BEP20\',$2,true,true)',[vault,account.publicExtendedKey]);
 await pg.query('INSERT INTO "UserDepositAddress"(id,"ownerId","vaultId",network,address,"derivationIndex") VALUES($1,$2,$3,\'BEP20\',$4,0)',[addressId,owner,vault,source]);
 await pg.exec('UPDATE "PayoutExpensePolicy" SET enabled=true,"perPayoutCap"=10000000000000000,"dailyCap"=100000000000000000 WHERE network=\'BEP20\'');
 const abi=new Interface(['function transfer(address,uint256)','function balanceOf(address) view returns(uint256)']);
 const txs=new Map<string,Transaction>();let nativeBalance=0n,tokenBalance=100n*10n**18n,mine=false,badNativeProof=false,sends=0,loads=0;
 const hash='0x'+'ab'.repeat(32),genesis='0'.repeat(16)+'cd'.repeat(24);
 const hex=(v:bigint)=>'0x'+v.toString(16),topicAddress=(a:string)=>'0x'+a.slice(2).toLowerCase().padStart(64,'0');
 const mock=(async(_url,init)=>{
  const p=JSON.parse(String(init?.body)),method=p.method,args=p.params;let result:unknown;
  if(method==='eth_chainId')result='0x38';
  else if(method==='eth_getBalance')result=hex(args[0]===parent?10n**18n:nativeBalance);
  else if(method==='eth_getTransactionCount')result='0x0';
  else if(method==='eth_gasPrice')result='0x3b9aca00';
  else if(method==='eth_call')result='0x'+tokenBalance.toString(16).padStart(64,'0');
  else if(method==='eth_estimateGas')result='0x11170';
  else if(method==='eth_sendRawTransaction'){
   const t=Transaction.from(args[0]);txs.set(t.hash!,t);sends++;
   if(t.data==='0x'){assert.equal(t.from,parent);assert.equal(t.to,source);nativeBalance+=t.value}
   else{assert.equal(t.from,source);assert.equal(t.to,bep20UsdtContract);const call=abi.decodeFunctionData('transfer',t.data);assert.equal(call[0],treasuryDestination('BEP20','operating'));assert.equal(call[1],100n*10n**18n);tokenBalance=0n}
   result=t.hash;
  }else if(method==='eth_getTransactionReceipt'){
   const t=txs.get(args[0]);if(!t||!mine)result=null;
   else{
    const position=Array.from(txs.keys()).indexOf(t.hash!),common={transactionHash:t.hash,transactionIndex:hex(BigInt(position)),blockNumber:'0x64',blockHash:hash};
    const call=t.data==='0x'?undefined:abi.decodeFunctionData('transfer',t.data);
    result={...common,from:t.from,to:t.data==='0x'&&badNativeProof?parent:t.to,status:'0x1',contractAddress:null,gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00',logs:call?[{...common,address:bep20UsdtContract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topicAddress(t.from!),topicAddress(call[0])],data:'0x'+BigInt(call[1]).toString(16).padStart(64,'0'),logIndex:'0x0',removed:false}]:[]};
   }
  }else if(method==='eth_getBlockByNumber')result={hash,number:args[0]==='finalized'?'0xc3':'0x64',transactions:Array.from(txs.keys())};
  else if(method==='eth_blockNumber')result='0xc8';else throw Error('unexpected fixture method '+method);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:p.id,result}),{headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 const opts={endpoint:'https://bsc.example.invalid',fetch:mock},tron={endpoint:'https://tron.example.invalid',fetch:mock};
 const gas=createNativeGasWorker(db,{enabled:true,rpc:opts,minimumConfirmations:15,loadKeys:()=>{loads++;return {key,policy:{expectedSender:parent,maxAmountBaseUnits:1000n*10n**18n,maxNetworkFeeBaseUnits:10n**16n}}}});
 const preflight=createFinancialPreflight({bep20:opts,tron,genesisId:genesis,tronReadOwner:treasuryDestination('TRC20','operating')});
 const resources=createOutboxResourceObserver({bep20:opts,tron,tronGenesisId:genesis});
 let shortApproval=true;
 const execution=createFinancialExecution(db,{purchaseEnabled:false,resources:async input=>({...await resources(input),expiresAt:new Date(Date.now()+(shortApproval?1500:25000)).toISOString()})});
 const prepare=createFinancialPreparation(db,{enabled:true,gas,preflight,energy:execution.energy,limits:()=>({maxAmount:1000n*10n**18n,maxFee:10n**16n,minimumSweep:10n**18n}),signSweep:(d,c)=>prepareSignedSweep(d,c,{loadKeys:()=>({accountXpub:account.publicExtendedKey,accountXprv:account.privateExtendedKey})})});
 const job={kind:'PREPARE_SWEEP' as const,id:addressId},signal=new AbortController().signal;
 assert.equal((await prepare(job,signal)).state,'HELD');assert.equal(sends,1);assert.equal(loads,1);
 const g=(await pg.query<{id:string;state:string}>('SELECT id,state FROM "NativeGasOutbox"')).rows[0];assert.equal(g.state,'ACKNOWLEDGED');
 assert.equal((await prepare(job,signal)).state,'HELD');assert.equal(sends,1); // Pending funding cannot be inferred from latest balance.
 mine=true;badNativeProof=true;assert.equal((await gas.process(g.id,signal)).state,'HELD');assert.equal(sends,1);badNativeProof=false;
 const saved=await prepare(job,signal);assert.equal(saved.state,'SAVED');if(saved.state!=='SAVED')throw Error('not saved');
 assert.equal(sends,1);assert.equal(loads,1);assert.equal((await pg.query<{state:string}>('SELECT state FROM "NativeGasOutbox"')).rows[0].state,'CONFIRMED');
 assert.equal((await execution.authorize({id:saved.id,kind:'SWEEP',createdAt:new Date().toISOString()},signal)).state,'RESERVED');
 const expenseBefore=(await pg.query<{expense:string}>('SELECT expense FROM "SweepDispatchAuthorization"')).rows[0].expense;
 shortApproval=false;
 await new Promise(resolve=>setTimeout(resolve,1600));
 assert.equal((await execution.authorize({id:saved.id,kind:'SWEEP',createdAt:new Date().toISOString()},signal)).state,'REFRESHED');
 assert.equal((await pg.query<{expense:string}>('SELECT expense FROM "SweepDispatchAuthorization"')).rows[0].expense,expenseBefore);
 assert.equal((await pg.query('SELECT id FROM "DispatchApprovalHistory" WHERE "outboxId"=$1',[saved.id])).rows.length,1);

 const observer={enabled:true,bep20:createBep20ReadRpc(opts),tron:async()=>{throw Error('TRON unused')},tronGenesisId:genesis,minimumBep20Confirmations:15,dispatchEnabled:true,send:createChainBroadcaster({enabled:true,bep20:opts,tron,tronGenesisId:genesis})};
 assert.equal((await processSweepObservation(db,saved.id,observer)).state,'CONFIRMED');assert.equal(sends,2);
 assert.equal((await processSweepObservation(db,saved.id,observer)).state,'CONFIRMED');assert.equal(sends,2);
 const current=(await pg.query<{txId:string;signedPayload:string}>('SELECT "txId","signedPayload" FROM "SignedSweepOutbox" WHERE id=$1',[saved.id])).rows[0];
 await assert.rejects(()=>authorizeSweepDispatch(db,saved.id,{network:'BEP20',txId:current.txId,sender:source,observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+10000).toISOString(),tokenBalance:100n*10n**18n,nativeBalance:10n**18n,resourceCost:0n,pendingNonce:0,estimatedGas:70000n}),/CONFLICT/);
 await assert.rejects(()=>pg.exec('UPDATE "NativeGasOutbox" SET "fundingAmount"=1'),/IMMUTABLE/);
 assert.equal((await pg.query<{state:string}>('SELECT state FROM "SweepDispatchAuthorization"')).rows[0].state,'SETTLED');
 console.log('Autonomous BEP20 fixture cycle: discover balance -> bounded operating BNB prefund -> durable ACK/no resend -> canonical funding -> HD sweep signing -> live-resource authorization -> exact saved-byte broadcast -> final transfer settlement/replay passed. No live network or money.');
}finally{await pg.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
