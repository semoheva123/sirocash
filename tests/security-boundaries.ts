import assert from 'node:assert/strict';
import {HDKey} from '@scure/bip32';
import {TronWeb} from 'tronweb';
import {emailAuthError} from '../lib/email-auth';
import {apiError,sameOrigin,PublicApiError} from '../lib/api';
import {runCustodyPreflight,verifyTronCustodyKeys} from '../lib/custody-preflight';
import {deriveTronDepositAddress} from '../lib/tron-addresses';
async function main(){
 const secret='do-not-disclose-this-database-password';
 for(const e of [Error(secret),{message:secret,code:'23505'},new SyntaxError(secret)]){
  const response=apiError(e);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(await response.json()).includes(secret));
 }
 assert.equal((await apiError(new PublicApiError('public-safe-message')).json()).error,'public-safe-message');
 assert.ok(!JSON.stringify(await emailAuthError(Error('خطأ provider '+secret)).json()).includes(secret));
 const old={NODE_ENV:process.env.NODE_ENV,WEBAUTHN_ORIGIN:process.env.WEBAUTHN_ORIGIN};
 try{
  Object.assign(process.env,{NODE_ENV:'production',WEBAUTHN_ORIGIN:'https://wallet.example.test'});
  const req=(origin?:string,extra:Record<string,string>={})=>new Request('https://wallet.example.test/api/action',{method:'POST',headers:{...(origin?{origin}:{}),...extra}});
  sameOrigin(req('https://wallet.example.test'));
  for(const r of [req(),req('https://evil.test'),req('https://evil.test',{host:'evil.test','x-forwarded-host':'evil.test'}),req('http://wallet.example.test'),req('https://wallet.example.test',{ 'sec-fetch-site':'cross-site'}),req('null')])assert.throws(()=>sameOrigin(r));
  delete process.env.WEBAUTHN_ORIGIN;assert.throws(()=>sameOrigin(req('https://wallet.example.test')));
 }finally{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
 const account=HDKey.fromMasterSeed(new Uint8Array(32).fill(81)).derive("m/44'/195'/0'");
 const key='01'.padStart(64,'0');
 try{
  const input={operatingPrivateKey:key,accountXprv:account.privateExtendedKey,accountXpub:account.publicExtendedKey,expectedOperatingAddress:TronWeb.address.fromPrivateKey(key) as string,expectedFirstAddress:deriveTronDepositAddress(account.publicExtendedKey,0).address};
  const result=verifyTronCustodyKeys(input);assert.equal(result.signingEnabled,false);
  const serialized=JSON.stringify(result);for(const value of [key,input.accountXprv,input.accountXpub])assert.ok(!serialized.includes(value));
  for(const change of [{accountXpub:'xpub-invalid'},{accountXprv:account.publicExtendedKey},{expectedFirstAddress:input.expectedOperatingAddress},{expectedOperatingAddress:input.expectedFirstAddress},{operatingPrivateKey:secret}])assert.throws(()=>verifyTronCustodyKeys({...input,...change}),e=>e instanceof Error&&e.message==='CUSTODY_KEY_BINDING_CHECK_FAILED');
  assert.deepEqual(runCustodyPreflight({}),{status:'SKIPPED'});
  for(const env of [{SIRO_CUSTODY_PREFLIGHT:'true',VERCEL_ENV:'preview',SIRO_SIGNER_ENABLED:'false'},{SIRO_CUSTODY_PREFLIGHT:'true',VERCEL_ENV:'production',SIRO_SIGNER_ENABLED:'true'}])assert.throws(()=>runCustodyPreflight(env),/REQUIRES_DISABLED_PRODUCTION_SIGNER/);
  assert.throws(()=>runCustodyPreflight({SIRO_CUSTODY_PREFLIGHT:'true',VERCEL_ENV:'production',SIRO_SIGNER_ENABLED:'false'}),/CONFIGURATION_MISSING/);
 }finally{account.wipePrivateData()}
 console.log('Security boundaries passed: sanitized HTTP errors/no-store, exact trusted origin, forwarded-host spoof/missing-origin rejection, offline custody binding with no signing/secret outputs, disabled preflight defaults. Deterministic public fixtures only.');
}
main().catch(()=>{console.error('Security boundary tests failed; no test inputs printed.');process.exitCode=1});
