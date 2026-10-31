import {deriveBep20DepositAddress} from '../lib/evm-deposit-addresses';
import assert from 'node:assert/strict';
import {HDKey} from '@scure/bip32';
import {TronWeb} from 'tronweb';
import {emailAuthError,requestCode} from '../lib/email-auth';
import {apiError,sameOrigin,PublicApiError} from '../lib/api';
import {runCustodyPreflight,verifyTronCustodyKeys,verifyBep20DepositKeys,runBep20DepositPreflight} from '../lib/custody-preflight';
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
 // Identical signup responses/delivery; an existing user's real challenge is never replaced.
 const configBefore={WEBAUTHN_ORIGIN:process.env.WEBAUTHN_ORIGIN,AUTH_SECRET:process.env.AUTH_SECRET,RESEND_API_KEY:process.env.RESEND_API_KEY,RESEND_FROM_EMAIL:process.env.RESEND_FROM_EMAIL};
 try{
  Object.assign(process.env,{WEBAUTHN_ORIGIN:'https://wallet.example.test',AUTH_SECRET:'x'.repeat(32),RESEND_API_KEY:'fixture-not-a-key',RESEND_FROM_EMAIL:'test@example.test'});
  for(const existing of [false,true]){
   const writes:string[]=[];let delivered=0;
   const query=async(sql:string)=>{writes.push(sql);return {rows:sql.includes('SELECT * FROM "EmailRateLimit"')?[{lastSentAt:0,windowStart:0,count:0}]:sql.includes('SELECT id,"passwordHash"')&&existing?[{id:'existing',passwordHash:'unchanged'}]:[]}};
   const response=await requestCode(new Request('https://wallet.example.test/api/auth/request',{method:'POST',headers:{origin:'https://wallet.example.test'},body:JSON.stringify({email:'test@example.test',password:'a long fixture password',mode:'signup'})}),{pool:()=>({query}),transaction:async(run:Function)=>run({query}),sendEmail:async()=>{delivered++}} as any);
   assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
   const body=await response.json();assert.deepEqual(Object.keys(body),['challengeId','expiresIn','resendAfter']);assert.match(body.challengeId,/^[a-f0-9]{48}$/);assert.equal(delivered,1);
   assert.equal(writes.some(sql=>sql.startsWith('INSERT INTO "EmailChallenge"')),!existing);
   assert.equal(writes.some(sql=>sql.startsWith('DELETE FROM "EmailChallenge"')),!existing);
  }
 }finally{for(const [key,value] of Object.entries(configBefore)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
 const evm=HDKey.fromMasterSeed(new Uint8Array(32).fill(82)).derive("m/44'/60'/0'");
 try{
  const input={accountXprv:evm.privateExtendedKey,accountXpub:evm.publicExtendedKey,expectedFirstAddress:deriveBep20DepositAddress(evm.publicExtendedKey,0).address};
  const result=verifyBep20DepositKeys(input);assert.equal(result.signingEnabled,false);assert.equal(result.chainId,56);
  for(const value of [input.accountXprv,input.accountXpub])assert.ok(!JSON.stringify(result).includes(value));
  for(const change of [{accountXpub:'invalid'},{accountXprv:evm.publicExtendedKey},{expectedFirstAddress:'0x'+'0'.repeat(40)}])assert.throws(()=>verifyBep20DepositKeys({...input,...change}),/CUSTODY_KEY_BINDING_CHECK_FAILED/);
  assert.deepEqual(runBep20DepositPreflight({}),{status:'SKIPPED'});
  assert.throws(()=>runBep20DepositPreflight({SIRO_BEP20_CUSTODY_PREFLIGHT:'true',VERCEL_ENV:'preview',SIRO_SIGNER_ENABLED:'false'}),/REQUIRES_DISABLED_PRODUCTION_SIGNER/);
  assert.throws(()=>runBep20DepositPreflight({SIRO_BEP20_CUSTODY_PREFLIGHT:'true',VERCEL_ENV:'production',SIRO_SIGNER_ENABLED:'true'}),/REQUIRES_DISABLED_PRODUCTION_SIGNER/);
  assert.throws(()=>runBep20DepositPreflight({SIRO_BEP20_CUSTODY_PREFLIGHT:'true',VERCEL_ENV:'production',SIRO_SIGNER_ENABLED:'false'}),/CONFIGURATION_MISSING/);
 }finally{evm.wipePrivateData()}
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
