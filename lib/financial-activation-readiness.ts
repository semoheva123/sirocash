import {financialConnectionString} from './financial-connection';
/** Configuration-only diagnostic: never returns values or loads keys, connects, signs or sends. */
export function financialActivationReadiness(env:Record<string,string|undefined>){
 const blockers:string[]=[];
 const requireValue=(key:string,valid:(value:string)=>boolean=v=>v.trim().length>0)=>{if(!valid(env[key]??''))blockers.push(key)};
 const positive=(v:string)=>/^[1-9]\d{0,77}$/.test(v);
 requireValue('VERCEL_ENV',v=>v==='production');
 try{const value=financialConnectionString(env);const u=value?new URL(value):undefined;if(!u||!['postgres:','postgresql:'].includes(u.protocol)||decodeURIComponent(u.username).split('.')[0]!=='sirocash_financial_worker'||!u.password)blockers.push('FINANCIAL_DATABASE_URL')}catch{blockers.push('FINANCIAL_DATABASE_URL')}
 requireValue('DATABASE_SSL_CA');
 requireValue('SIRO_FINANCIAL_WORKER_SECRET',v=>v.length>=32&&v.length<=512);
 for(const key of ['SIRO_CUSTOMER_FINANCE_ENABLED','SIRO_WITHDRAWALS_ENABLED','SIRO_CUSTOMER_DEPOSITS_ENABLED','SIRO_DEPOSIT_DISCOVERY_ENABLED','SIRO_DEPOSIT_VALUATION_ENABLED','SIRO_DURABLE_PASSKEY_ENABLED','SIRO_SIGNER_ENABLED','SIRO_RPC_READ_ENABLED','SIRO_OUTBOX_WORKER_ENABLED','SIRO_AUTOMATIC_PREPARATION_ENABLED','SIRO_NATIVE_GAS_ENABLED','SIRO_BROADCAST_ENABLED','SIRO_RESOURCE_AUTHORIZATION_ENABLED','SIRO_ENERGY_WORKER_ENABLED','SIRO_ENERGY_PURCHASE_ENABLED','SIRO_ACCEPT_VARIABLE_ENERGY_PRICE'])requireValue(key,v=>v==='true');
 for(const key of ['SIRO_BEP20_RPC_URL','SIRO_TRON_RPC_URL'])requireValue(key,v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash}catch{return false}});
 requireValue('SIRO_TRON_GENESIS_ID',v=>/^[a-f0-9]{64}$/.test(v));
 requireValue('SIRO_BEP20_MIN_CONFIRMATIONS',v=>/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)>=15);
 for(const network of ['TRC20','BEP20']){
  for(const suffix of ['MAX_TOKEN_BASE_UNITS','MAX_FEE_BASE_UNITS','MIN_SWEEP_BASE_UNITS'])requireValue(`SIRO_${network}_${suffix}`,positive);
  for(const suffix of ['DEPOSIT_ACCOUNT_XPUB','DEPOSIT_ACCOUNT_XPRV','OPERATING_PRIVATE_KEY'])requireValue(`SIRO_${network}_${suffix}`);
 }
 for(const key of ['TRONZAP_API_TOKEN','TRONZAP_API_SECRET'])requireValue(key);
 return {configurationReady:blockers.length===0,blockers,externalChecksRequired:['FINANCIAL_DB_ROLE_AND_TLS','ENABLED_BOUNDED_DB_POLICIES','SIGNER_ADDRESS_BINDINGS','RPC_CHAIN_AND_FINALITY','SCHEDULER_CREDENTIAL_AND_DEFAULT_BRANCH','OPERATING_AND_PROVIDER_LIQUIDITY','BOUNDED_FUNDED_ACCEPTANCE']} as const;
}
