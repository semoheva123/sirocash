import {runBep20DepositPreflight} from '../lib/custody-preflight';
// Private invocation only, never a build hook or public API. No network/DB/signatures.
try{console.log(JSON.stringify(runBep20DepositPreflight()))}
catch{console.error('BEP20 custody preflight failed. No secret values were printed; signing remains disabled.');process.exitCode=1}
