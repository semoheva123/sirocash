import {runCustodyPreflight} from '../lib/custody-preflight';
// Explicit private invocation only. No build hook/public endpoint, no remote environment export.
try{console.log(JSON.stringify(runCustodyPreflight()))}
catch{console.error('Custody preflight failed. No secret values were printed; signing remains disabled.');process.exitCode=1}
