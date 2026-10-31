import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:3000';
let cookie='';
async function post(path,data,extra={}){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{}),...extra},body:JSON.stringify(data)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()}}
for(const path of ['/','/dashboard','/deposit','/withdraw','/sham-cash','/mobile-topup','/auth'])assert.equal((await fetch(base+path)).status,200);
const before=await (await fetch(base+'/api/transactions')).json();
const operations=[['/api/wallet/transfer',{recipient:'SC-1234',amount:5,pin:'123456'}],['/api/wallet/withdraw',{recipient:'0x'+'a'.repeat(40),chain:'BEP20',amount:5,pin:'123456'}],['/api/wallet/sham-cash',{recipient:'12345678',amount:5,pin:'123456'}],['/api/mobile/topup',{operator:'MTN',phone:'0912345678',amount:5,pin:'123456'}]];
for(const [path,payload] of operations){assert.equal((await post(path,payload)).status,400);assert.equal((await post(path,payload,{'x-siro-approval':'forged-token'})).status,400)}
const status=await post('/api/security/passkey',{action:'status'});assert.equal(status.status,400);
assert.equal((await post('/api/security/passkey',{action:'register-options'})).status,400);
assert.equal((await post('/api/security/passkey',{action:'register-verify',response:{}})).status,400);
assert.equal((await post('/api/security/passkey',{action:'authenticate-options',path:operations[0][0],payload:operations[0][1]})).status,400);
assert.equal((await post('/api/security/passkey',{action:'authenticate-verify',response:{}})).status,400);
assert.equal((await post('/api/security/passkey',{action:'status'},{Origin:'https://evil.example'})).status,400);
const after=await (await fetch(base+'/api/transactions')).json();assert.equal(after.balance,before.balance);assert.equal(after.transactions.length,before.transactions.length);
console.log('Security API tests passed: all payments blocked without verified passkey, forged approvals rejected, registration requires platform user verification, malformed proofs and cross-origin attempts rejected, balances unchanged.');

assert.equal((await post('/api/auth/request',{email:'invalid'})).status,400);
assert.equal((await post('/api/auth/verify',{challengeId:'invalid',code:'000000'})).status,400);
assert.equal((await post('/api/auth/request',{email:'test@example.com'},{Origin:'https://evil.example'})).status,503);
const auth=await (await fetch(base+'/api/auth/session')).json();assert.equal(auth.user,null);
console.log('Email API validation and unauthenticated passkey enrollment rejection passed.');

assert.equal((await post('/api/auth/request',{email:'test@example.com',mode:'signup',password:'short'})).status,400);
assert.equal((await post('/api/auth/request',{email:'test@example.com',mode:'login'})).status,400);
const missingConfig=await post('/api/auth/request',{email:'test@example.com',mode:'signup',password:'a long unique password!'});
if(missingConfig.status!==200)assert.equal(JSON.stringify(missingConfig.data).includes('Resend'),false);
console.log('Password-required API validation and provider-neutral errors passed.');

for(const [asset,chain] of [['USDT','TRC20'],['USDT','BEP20'],['USDC','ETHEREUM'],['USDC','POLYGON']]){
 const result=await post('/api/deposit/generate-address',{asset,chain});assert.equal(result.status,200);assert.equal(result.data.asset,asset);assert.equal(result.data.chain,chain);assert.equal(result.data.demo,true);assert.ok(result.data.address.includes('DEMO'));
}
for(const chain of ['TRC20','BEP20'])assert.equal((await post('/api/deposit/generate-address',{asset:'USDC',chain})).status,400);
assert.equal((await post('/api/wallet/withdraw',{asset:'USDC',chain:'ETHEREUM',recipient:'0x'+'a'.repeat(40),amount:1,pin:'123456'})).status,400);
console.log('USDC API tests passed: supported demo pairs, rejected incompatible networks, and withdrawal blocked without device approval.');

const readiness=await fetch(base+'/api/health/database');
assert.ok([200,503].includes(readiness.status));
assert.equal(readiness.headers.get('cache-control'),'no-store');
const readinessBody=await readiness.json();
assert.deepEqual(Object.keys(readinessBody),['database']);
assert.ok((readiness.status===200?['ready']:['not_configured','unavailable']).includes(readinessBody.database));
console.log('Database readiness API passed: bounded response, no-store, and no database details exposed.');
const guestOverview=await (await fetch(base+'/api/transactions')).json();
assert.equal(guestOverview.demo,true);assert.equal(guestOverview.user,null);
assert.equal(guestOverview.financialServicesEnabled,false);
// An unknown session must not receive another user's financial data.
const unknownSession=await fetch(base+'/api/transactions',{headers:{Cookie:'siro-auth='+'a'.repeat(64)}});
const unknownBody=await unknownSession.json();
assert.ok([200,503].includes(unknownSession.status));
if(unknownSession.status===503){assert.equal(unknownBody.balance,null);assert.equal(unknownBody.demo,false);assert.deepEqual(unknownBody.transactions,[])}
else{assert.equal(unknownBody.demo,true);assert.equal(unknownBody.user,null)}
console.log('Account API: explicit guest demo and no account-error fallback to shared balances passed.');
for(const path of ['/dashboard','/deposit','/withdraw','/sham-cash','/mobile-topup','/settings']){
 const response=await fetch(base+path,{redirect:'manual'});
 assert.equal(response.status,307,`${path} must require a server-verified session`);
 assert.equal(new URL(response.headers.get('location'),base).pathname,'/auth');
 const forged=await fetch(base+path,{redirect:'manual',headers:{Cookie:'siro-auth='+'b'.repeat(64)}});
 // Invalid sessions redirect; a database outage fails closed instead of exposing the account page.
 assert.ok([307,500].includes(forged.status));
 if(forged.status===307)assert.equal(new URL(forged.headers.get('location'),base).pathname,'/auth');
}
console.log('Private page routing: anonymous redirect and invalid-session fail-closed behavior passed.');
const passwordPath='/api/auth/password';
const passwordInput={currentPassword:'existing-password-123',newPassword:'new-unique-password-456',confirmation:'new-unique-password-456'};
assert.equal((await post(passwordPath,passwordInput)).status,401);
assert.equal((await post(passwordPath,{...passwordInput,confirmation:'mismatched-confirmation'})).status,400);
assert.equal((await post(passwordPath,{...passwordInput,newPassword:'short',confirmation:'short'})).status,400);
assert.equal((await post(passwordPath,{...passwordInput,userId:'forged-user'})).status,400);
assert.equal((await post(passwordPath,passwordInput,{Origin:'https://evil.example'})).status,403);
const passwordResponse=await fetch(base+passwordPath,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(passwordInput)});
assert.equal(passwordResponse.headers.get('cache-control'),'no-store');
console.log('Password-change API: unauthenticated, mismatched, weak, forged-target and cross-origin requests rejected.');

assert.equal((await post(passwordPath,{challengeId:'a'.repeat(48),code:'123456'})).status,401);
assert.equal((await post(passwordPath,{challengeId:'a'.repeat(48),code:'123'})).status,400);
assert.equal((await post(passwordPath,{challengeId:'a'.repeat(48),code:'123456',newPassword:'forged-password-123'})).status,400);
assert.equal((await post(passwordPath,{challengeId:'a'.repeat(48),code:'123456'},{Origin:'https://evil.example'})).status,403);
console.log('Password OTP API: unauthenticated, malformed, payload substitution and cross-origin confirmations rejected.');

for(const path of ['/api/auth/sessions','/api/auth/security-events']){const r=await fetch(base+path);assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store')}
for(const path of ['/api/auth/email','/api/auth/recovery'])assert.equal((await post(path,{email:'invalid',userId:'forged'})).status,400);
assert.equal((await post('/api/auth/email',{newEmail:'new@example.test',currentPassword:'current-password-123'})).status,401);
assert.equal((await post('/api/auth/email',{challengeId:'a'.repeat(48),oldCode:'123456',newCode:'654321'})).status,401);
for(const path of ['/api/auth/email','/api/auth/recovery'])assert.equal((await post(path,{}, {Origin:'https://evil.example'})).status,403);
const revoked=await fetch(base+'/api/auth/sessions',{method:'DELETE',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'revoke_all'})});assert.equal(revoked.status,401);
const forgedRevoke=await fetch(base+'/api/auth/sessions',{method:'DELETE',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({action:'revoke_all'})});assert.equal(forgedRevoke.status,403);
assert.equal((await fetch(base+'/operations',{redirect:'manual'})).status,307);
assert.ok([401,503].includes((await fetch(base+'/api/internal/security-notifications')).status));
for(const path of ['/auth/recovery','/trust','/privacy','/terms','/support'])assert.equal((await fetch(base+path)).status,200);
console.log('Lifecycle API: session/event privacy, email/recovery validation, cross-origin and guest revocation rejection, operations guard, job authentication and public information pages passed.');
// Identity intake has no demo/anonymous document path and no side effects without authorization.
assert.equal((await fetch(base+'/api/identity')).status,401);
assert.equal((await post('/api/identity',{})).status,401);
assert.equal((await post('/api/identity',{}, {Origin:'https://malicious.invalid'})).status,403);
assert.equal((await post('/api/identity/review',{})).status,403);
assert.equal((await fetch(base+'/api/identity',{method:'DELETE',headers:{Origin:base}})).status,401);
const identityGuard=await fetch(base+'/identity-review',{redirect:'manual'});assert.equal(identityGuard.status,307);assert.ok(identityGuard.headers.get('location')?.endsWith('/auth'));
console.log('Identity API: anonymous upload/status/delete denied, cross-origin rejected, reviewer denied by default, and private review page redirect preserved.');
