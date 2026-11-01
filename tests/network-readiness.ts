import assert from 'node:assert/strict';
import {probeNetworkReadiness} from '../lib/network-readiness';
const env={VERCEL_ENV:'production',SIRO_SIGNER_ENABLED:'false'},now=1800000000000;
const genesis='0'.repeat(16)+'ab'.repeat(24);
const calls:string[]=[];
const fetcher=(async(url,init)=>{
 const body=JSON.parse(String(init?.body)),path=new URL(String(url)).pathname;
 calls.push(body.method??path);
 const result=body.method==='eth_chainId'?'0x38':body.method==='eth_blockNumber'?'0x64':{number:body.params?.[0]==='finalized'?'0x60':'0x64',hash:'0x'+'cd'.repeat(32),timestamp:'0x'+(now/1000).toString(16)};
 return new Response(JSON.stringify(body.method?{jsonrpc:'2.0',id:body.id,result}:path.endsWith('getblockbynum')?{blockID:genesis}:{blockID:'0000000000000064'+'cd'.repeat(24),block_header:{raw_data:{number:100,timestamp:now}}}),{headers:{'content-type':'application/json'}});
}) as typeof fetch;
async function main(){
 const result=await probeNetworkReadiness(env,fetcher,now);
 assert.equal(result[0].status,'READ_CHAIN56_FINALIZED_VERIFIED');assert.equal(result[1].status,'READ_SOLID_TIP_VERIFIED');
 assert.equal(result[1].genesisPinned,false);assert.ok(result.every(r=>r.source==='PUBLIC_DIAGNOSTIC_ONLY'));
 assert.deepEqual(calls.filter(c=>c.startsWith('eth_')),['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByNumber']);
 for(const extra of [{VERCEL_ENV:'preview'},{SIRO_SIGNER_ENABLED:'true'},{SIRO_BROADCAST_ENABLED:'true'},{SIRO_OUTBOX_WORKER_ENABLED:'true'}])await assert.rejects(()=>probeNetworkReadiness({...env,...extra},fetcher,now),/DISABLED_FINANCE/);
 const pinned=await probeNetworkReadiness({...env,SIRO_TRON_GENESIS_ID:'0'.repeat(64)},fetcher,now);assert.equal(pinned[1].status,'READ_PREFLIGHT_FAILED');
 const failure=(async()=>{throw Error('secret URL and token must not appear')}) as typeof fetch;
 assert.ok(!JSON.stringify(await probeNetworkReadiness(env,failure,now)).includes('secret'));
 const stale=await probeNetworkReadiness(env,fetcher,now+180000);assert.ok(stale.every(r=>r.status==='READ_PREFLIGHT_FAILED'));
 console.log('Network readiness probe: read-only allowlists, diagnostic fallback separated from production trust, fresh chain/finality, disabled-finance guard and safe failures passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
