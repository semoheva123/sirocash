import 'server-only';
import {assertDepositOnlyIsolation,depositOnlyConfiguration} from './deposit-only-mode';
import {checkDepositWalletSetup} from './deposit-wallet-setup';
import type {WalletDb} from './wallet-engine';
/** Configuration/bindings only in a caller-enforced READ ONLY transaction, not scanner success. */
export async function verifyDepositMonitorReadiness(db:WalletDb,env:Record<string,string|undefined>=process.env){
 assertDepositOnlyIsolation(env);
 if(!depositOnlyConfiguration(env,{workerOnly:true}).configurationReady)throw Error('DEPOSIT_MONITOR_CONFIGURATION');
 const window=env.SIRO_BEP20_SCAN_WINDOW??'1000';
 if(!/^[1-9]\d{0,3}$/.test(window)||Number(window)>1000)throw Error('DEPOSIT_SCAN_WINDOW_INVALID');
 await db.transaction(async tx=>{
  for(const network of ['TRC20','BEP20'] as const){
   const xpub=env[`SIRO_${network}_DEPOSIT_ACCOUNT_XPUB`]??'';
   checkDepositWalletSetup({network,accountXpub:xpub,firstAddress:network==='TRC20'?'THici1qxA1dQZK52fJ18RHX8j1Ef1ktyDD':'0x6CD3350E7E635079038b6348781934e4040aC99b',origin:network==='TRC20'?"m/44'/195'/0'":"m/44'/60'/0'"});
   const {rows:[v]}=await tx.query('SELECT count(*)::int AS total FROM "DepositAddressVault" WHERE id=$1 AND network=$2 AND "accountXpub"=$3 AND enabled AND "originVerified"',[env[`SIRO_${network}_DEPOSIT_VAULT_ID`],network,xpub]);
   if(Number(v?.total)!==1)throw Error('DEPOSIT_VAULT_BINDING_UNVERIFIED');
  }
  const {rows:[a]}=await tx.query('SELECT count(*)::int AS total FROM "LedgerAccount" WHERE id=$1 AND "userId" IS NULL AND "accountType"=\'MASTER_POOL\' AND currency=\'USD\'',[env.SIRO_SETTLEMENT_ACCOUNT_ID]);
  if(Number(a?.total)!==1)throw Error('DEPOSIT_SETTLEMENT_UNVERIFIED');
  const {rows:[s]}=await tx.query('SELECT count(*)::int AS total FROM "DepositNetworkScanner" WHERE network IN (\'TRC20\',\'BEP20\') AND NOT paused');
  if(Number(s?.total)!==2)throw Error('DEPOSIT_SCANNER_REVIEW_REQUIRED');
 });
 return {status:'CONFIGURATION_VERIFIED',networks:2,scanWindow:Number(window),customerReceptionConfigured:env.SIRO_CUSTOMER_DEPOSITS_ENABLED==='true',liveScannerAcceptanceRequired:true,externalExecution:false} as const;
}
