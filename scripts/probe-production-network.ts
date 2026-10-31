import {probeNetworkReadiness} from '../lib/network-readiness';
// Deliberately non-deploying BUILD probe. Never add to normal build or a public endpoint.
async function main(){
 try{for(const result of await probeNetworkReadiness(process.env))console.log('NETWORK_READ_PROBE:'+JSON.stringify(result))}
 catch{console.log('NETWORK_READ_PROBE_REFUSED_REQUIRES_DISABLED_PRODUCTION_FINANCE')}
 console.log('NETWORK_READ_PROBE_COMPLETE_NO_DEPLOYMENT');process.exitCode=1;
}
void main();
