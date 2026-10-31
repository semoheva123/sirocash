import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {tronZapReadClient,tronZapCredentials} from '../lib/tronzap';
const credentials={token:'test-token',secret:'test-secret'};
const address='TFMUACLuYyFcw9YzrAgESnQ9a6pvEiY1bL';
let calls=0;
const mock=(result:unknown,status=200):typeof fetch=>async(url,init)=>{
 calls++;assert.ok(['/v1/balance','/v1/calculate'].some(path=>url==='https://api.tronzap.com'+path));
 assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
 const headers=init?.headers as Record<string,string>;
 assert.equal(headers.Authorization,'Bearer test-token');
 assert.equal(headers['X-Signature'],createHash('sha256').update(String(init?.body)+credentials.secret).digest('hex'));
 return new Response(JSON.stringify(result),{status});
};
async function main(){
 assert.throws(()=>tronZapCredentials({}));assert.throws(()=>tronZapCredentials({TRONZAP_API_TOKEN:'x\ny',TRONZAP_API_SECRET:'secret'}));
 const balance=await tronZapReadClient(credentials,mock({code:0,result:{balance:0,address}})).balance();assert.equal(balance.balance,'0');
 const result={address,type:'energy',amount:65000,duration:1,price:2.45,activation_fee:0,total:2.45};
 assert.equal((await tronZapReadClient(credentials,mock({code:0,result})).calculateEnergy(address,65000)).total,'2.45');
 for(const data of [{code:1,message:'test-secret'},{code:5},{code:0,result:{balance:-1,address}},{code:0,result:{}}])await assert.rejects(()=>tronZapReadClient(credentials,mock(data)).balance(),error=>error instanceof Error&&!error.message.includes('test-secret'));
 await assert.rejects(()=>tronZapReadClient(credentials,mock({},401)).balance(),/AUTHENTICATION/);
 await assert.rejects(()=>tronZapReadClient(credentials,mock({code:0,result:{...result,total:3}})).calculateEnergy(address,65000));
 await assert.rejects(()=>tronZapReadClient(credentials,mock({code:0,result:{...result,amount:131000}})).calculateEnergy(address,65000));
 const before=calls;await assert.rejects(()=>tronZapReadClient(credentials,mock({})).calculateEnergy(address,1));assert.equal(calls,before);
 await assert.rejects(()=>tronZapReadClient(credentials,async()=>{throw Error('test-secret')}).balance(),/TRANSPORT/);
 console.log('TronZap signed read-only transport: signature, balance, calculation, errors, no secret leakage and no purchase paths passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
