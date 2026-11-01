import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run=extra=>spawnSync(process.execPath,['--conditions=react-server','--import','tsx','scripts/probe-production-custody.ts'],{env:{PATH:process.env.PATH,...extra},encoding:'utf8'});
for(const extra of [{},{VERCEL_ENV:'preview',SIRO_SIGNER_ENABLED:'false'},{VERCEL_ENV:'production',SIRO_SIGNER_ENABLED:'true'}]){
 const r=run(extra);assert.equal(r.status,1);assert.equal(r.stdout.trim(),'CUSTODY_PROBE_REFUSED_REQUIRES_DISABLED_PRODUCTION_SIGNER');assert.equal(r.stderr,'');
}
const missing=run({VERCEL_ENV:'production',SIRO_SIGNER_ENABLED:'false'});assert.equal(missing.status,1);
for(const stage of ['TRC20_CUSTODY','BEP20_DEPOSIT','BEP20_OPERATING'])assert.ok(missing.stdout.includes(stage+':CUSTODY_PREFLIGHT_CONFIGURATION_MISSING'));
const secret='never-print-this-fixture-key';
const invalid=run({VERCEL_ENV:'production',SIRO_SIGNER_ENABLED:'false',SIRO_TRC20_OPERATING_PRIVATE_KEY:secret,SIRO_TRC20_DEPOSIT_ACCOUNT_XPRV:secret,SIRO_TRC20_DEPOSIT_ACCOUNT_XPUB:secret,SIRO_BEP20_DEPOSIT_ACCOUNT_XPRV:secret,SIRO_BEP20_DEPOSIT_ACCOUNT_XPUB:secret,SIRO_BEP20_OPERATING_PRIVATE_KEY:secret});
assert.equal(invalid.status,1);assert.ok(!invalid.stdout.includes(secret));assert.ok(!invalid.stderr.includes(secret));
for(const stage of ['TRC20_CUSTODY','BEP20_DEPOSIT','BEP20_OPERATING'])assert.ok(invalid.stdout.includes(stage+':CUSTODY_KEY_BINDING_CHECK_FAILED'));
assert.ok(invalid.stdout.includes('CUSTODY_PROBE_COMPLETE_NO_DEPLOYMENT'));
console.log('Private custody probe: refused outside disabled production, missing/invalid keys sanitized, all stages checked, always non-deploying. No production secrets used.');
