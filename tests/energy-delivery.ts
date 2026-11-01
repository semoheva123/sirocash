import assert from 'node:assert/strict';
import {TronWeb} from 'tronweb';
import {createEnergyDeliveryObserver} from '../lib/energy-delivery-observer';
async function main(){
 const sender=String(TronWeb.address.fromPrivateKey('01'.repeat(32))),genesisId='0'.repeat(16)+'aa'.repeat(24),delegationTxId='ab'.repeat(32),blockId='0000000000000064'+'cd'.repeat(24);
 let mode='good',reads=0;
 const fetcher=(async(url,init)=>{
  const p=JSON.parse(String(init?.body)),path=new URL(String(url)).pathname;reads++;
  const value=path.endsWith('gettransactioninfobyid')?{id:delegationTxId,blockNumber:100}:path.endsWith('getnowblock')?{blockID:'0000000000000069'+'cd'.repeat(24),block_header:{raw_data:{number:mode==='unfinal'?99:105,timestamp:Date.now()-(mode==='stale'?300000:0)}}}:path.endsWith('getaccountresource')?{EnergyLimit:mode==='insufficient'?1:70000,EnergyUsed:500}:p.num===0?{blockID:mode==='wrongchain'?'bad':genesisId}:{blockID:blockId,block_header:{raw_data:{number:100}},transactions:[{txID:delegationTxId,ret:[{contractRet:mode==='failed'?'FAILED':'SUCCESS'}],raw_data:{contract:[{type:mode==='unsupported'?'TransferContract':'DelegateResourceContract',parameter:{value:{resource:'ENERGY',balance:1000000,receiver_address:TronWeb.address.toHex(mode==='receiver'?String(TronWeb.address.fromPrivateKey('02'.repeat(32))):sender)}}}]}}]};
  return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 const observer=createEnergyDeliveryObserver({endpoint:'https://tron.example.invalid',genesisId,fetch:fetcher});
 const input={sender,delegationTxId,energyAmount:65000,signal:new AbortController().signal};
 assert.equal((await observer(input)).energyAmount,65000);
 for(mode of ['wrongchain','unfinal','stale','insufficient','failed','unsupported','receiver'])await assert.rejects(()=>observer(input),/UNPROVEN/);
 const stopped=new AbortController();stopped.abort();const n=reads;await assert.rejects(()=>observer({...input,signal:stopped.signal}),/UNPROVEN/);assert.equal(reads,n);
 console.log('Energy delivery: pinned genesis, successful solid native delegation to exact receiver, usable resources, fresh bounded evidence, unsupported/failure/abort holding passed. Fixtures only.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
