import {financialActivationReadiness} from '../lib/financial-activation-readiness';
// Explicit local/operator invocation only. Values are never printed; this is NOT a live probe.
const result=financialActivationReadiness(process.env);
console.log('Financial activation configuration (no external effects): '+JSON.stringify(result));
if(process.argv.includes('--strict')&&!result.configurationReady)process.exitCode=1;
