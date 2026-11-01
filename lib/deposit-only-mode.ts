/** Deposit-only custody: no signing, funding, provider purchase, sweep, payout or transfer.
 * An independent mode, not permission to relax any full-execution spending gate. */
export function depositOnlyMode(env:Readonly<Record<string,string|undefined>>=process.env){return env.SIRO_DEPOSIT_ONLY_ENABLED==='true'}
export const depositOnlyForbiddenFlags=['SIRO_SIGNER_ENABLED','SIRO_BROADCAST_ENABLED','SIRO_AUTOMATIC_PREPARATION_ENABLED','SIRO_NATIVE_GAS_ENABLED','SIRO_RESOURCE_AUTHORIZATION_ENABLED','SIRO_ENERGY_WORKER_ENABLED','SIRO_ENERGY_PURCHASE_ENABLED','SIRO_WITHDRAWALS_ENABLED'] as const;
export function assertDepositOnlyIsolation(env:Readonly<Record<string,string|undefined>>=process.env){
 if(!depositOnlyMode(env)||depositOnlyForbiddenFlags.some(key=>env[key]==='true'))throw Error('DEPOSIT_ONLY_ISOLATION_REQUIRED');
}
export function depositOnlyConfiguration(env:Readonly<Record<string,string|undefined>>=process.env){
 const blockers:string[]=[];
 if(env.VERCEL_ENV!=='production')blockers.push('VERCEL_ENV');
 if(!depositOnlyMode(env))blockers.push('SIRO_DEPOSIT_ONLY_ENABLED');
 for(const key of depositOnlyForbiddenFlags)if(env[key]==='true')blockers.push(key);
 for(const key of ['SIRO_CUSTOMER_DEPOSITS_ENABLED','SIRO_DEPOSIT_DISCOVERY_ENABLED','SIRO_DEPOSIT_VALUATION_ENABLED','SIRO_RPC_READ_ENABLED','SIRO_OUTBOX_WORKER_ENABLED'])if(env[key]!=='true')blockers.push(key);
 if(env.SIRO_PRICING_PROVIDER!=='coinbase-spot-v1')blockers.push('SIRO_PRICING_PROVIDER');
 if(!/^0{16}[a-f0-9]{48}$/.test(env.SIRO_TRON_GENESIS_ID??''))blockers.push('SIRO_TRON_GENESIS_ID');
 for(const network of ['TRC20','BEP20']){
  if(!/^[1-9]\d{0,77}$/.test(env[`SIRO_${network}_MAX_TOKEN_BASE_UNITS`]??''))blockers.push(`SIRO_${network}_MAX_TOKEN_BASE_UNITS`);
  if(!/^[a-f0-9-]{36}$/i.test(env[`SIRO_${network}_DEPOSIT_VAULT_ID`]??''))blockers.push(`SIRO_${network}_DEPOSIT_VAULT_ID`);
 }
 return {configurationReady:!blockers.length,blockers,externalChecksRequired:['DEPOSIT_ACCOUNT_BINDINGS','RPC_DISCOVERY_AND_FINALITY','LIVE_PRICE_SOURCE','SCHEDULER_ON_DEFAULT_BRANCH','SCANNER_THROUGHPUT_AND_LAG','BOUNDED_DEPOSIT_CREDIT_ACCEPTANCE']} as const;
}
