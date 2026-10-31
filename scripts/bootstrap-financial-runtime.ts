import {Pool} from 'pg';
import {randomBytes,pbkdf2Sync,createHmac,createHash} from 'node:crypto';
import {computeAddress,Interface} from 'ethers';
import {databaseOptions} from '../lib/database-options';
import {financialConnectionString} from '../lib/financial-connection';
import {runCustodyPreflight,runBep20DepositPreflight} from '../lib/custody-preflight';
import {treasuryDestination} from '../lib/treasury-addresses';
import {probeNetworkReadiness} from '../lib/network-readiness';
import {tronZapReadClient,tronZapCredentials} from '../lib/tronzap';
import {observeUsdtUsdPrice} from '../lib/financial-price';
import {financialBscRpc} from '../lib/financial-rpc';
import {chainJsonPost} from '../lib/chain-http';
import {TronWeb} from 'tronweb';
import {bep20UsdtContract} from '../lib/bep20-deposit-verification';
import {tronUsdtContract} from '../lib/tron-deposit-verification';
/** Reviewed one-use BUILD provisioning. Never signs, buys or broadcasts; never promotes itself. */
async function main(){
 if(process.env.VERCEL_ENV!=='production'||process.env.SIRO_SIGNER_ENABLED!=='false'||process.env.SIRO_BROADCAST_ENABLED==='true'||process.env.SIRO_OUTBOX_WORKER_ENABLED==='true')throw Error('BOOTSTRAP_REQUIRES_DISABLED_FINANCE');
 runCustodyPreflight({...process.env,SIRO_CUSTODY_PREFLIGHT:'true',SIRO_TRC20_DEPOSIT_FIRST_ADDRESS:'THici1qxA1dQZK52fJ18RHX8j1Ef1ktyDD'});
 runBep20DepositPreflight({...process.env,SIRO_BEP20_CUSTODY_PREFLIGHT:'true',SIRO_BEP20_DEPOSIT_FIRST_ADDRESS:'0x6CD3350E7E635079038b6348781934e4040aC99b'});
 const key=process.env.SIRO_BEP20_OPERATING_PRIVATE_KEY;if(!key||computeAddress('0x'+key.replace(/^0x/,''))!==treasuryDestination('BEP20','operating'))throw Error('BEP20_BINDING_FAILED');
 console.log('BOOTSTRAP_CUSTODY:ALL_BINDINGS_MATCHED_NO_SIGNING');
 const password=process.env.FINANCIAL_DATABASE_PASSWORD,connection=financialConnectionString(process.env);
 if(!password||!connection||!process.env.DATABASE_URL)throw Error('BOOTSTRAP_CREDENTIAL_MISSING');
 const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,'sha256');
 const clientKey=createHmac('sha256',salted).update('Client Key').digest(),storedKey=createHash('sha256').update(clientKey).digest(),serverKey=createHmac('sha256',salted).update('Server Key').digest();
 const verifier=`SCRAM-SHA-256$4096:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
 salted.fill(0);clientKey.fill(0);storedKey.fill(0);serverKey.fill(0);
 const app=new Pool(databaseOptions(process.env.DATABASE_URL,true,process.env.DATABASE_SSL_CA));
 try{await app.query('SELECT public.provision_financial_runtime_once($1,$2,$3)',[process.env.SIRO_TRC20_DEPOSIT_ACCOUNT_XPUB,process.env.SIRO_BEP20_DEPOSIT_ACCOUNT_XPUB,verifier]);console.log('BOOTSTRAP_DATABASE:PROVISIONED')}finally{await app.end()}
 const worker=new Pool(databaseOptions(connection,true,process.env.DATABASE_SSL_CA));
 try{const {rows:[r]}=await worker.query(`SELECT current_user='sirocash_financial_worker' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT has_column_privilege(current_user,'public."User"','passwordHash','SELECT') AND NOT has_table_privilege(current_user,'public."AuthSession"','SELECT') AS safe FROM pg_roles WHERE rolname=current_user`);if(r?.safe!==true)throw Error('BOOTSTRAP_ROLE_UNSAFE');console.log('BOOTSTRAP_CONNECTION:VERIFIED_TLS_RESTRICTED_WORKER')}finally{await worker.end()}
 for(const row of await probeNetworkReadiness(process.env))console.log('BOOTSTRAP_NETWORK:'+JSON.stringify(row));
 try{const price=await observeUsdtUsdPrice();console.log('BOOTSTRAP_PRICE:'+JSON.stringify({status:'OBSERVED',rateUsdMicros:price.rate.toString(),observedAt:price.observedAt}))}catch{console.log('BOOTSTRAP_PRICE:UNAVAILABLE')}
 try{const balance=await tronZapReadClient(tronZapCredentials()).balance();console.log('BOOTSTRAP_PROVIDER:'+JSON.stringify({balanceTrx:balance.balance,paidCalls:0}))}catch{console.log('BOOTSTRAP_PROVIDER:READ_FAILED')}
 const signal=AbortSignal.timeout(20000);
 try{
  const rpc=financialBscRpc({endpoint:process.env.SIRO_BEP20_RPC_URL!,authorization:process.env.SIRO_BEP20_RPC_AUTHORIZATION}),abi=new Interface(['function balanceOf(address) view returns(uint256)']);
  const [native,token]=await Promise.all([rpc('eth_getBalance',[treasuryDestination('BEP20','operating'),'latest'],signal),rpc('eth_call',[{to:bep20UsdtContract,data:abi.encodeFunctionData('balanceOf',[treasuryDestination('BEP20','operating')])},'latest'],signal)]);
  console.log('BOOTSTRAP_LIQUIDITY_BEP20:'+JSON.stringify({nativeBaseUnits:BigInt(String(native)).toString(),usdtBaseUnits:BigInt(String(token)).toString()}));
 }catch{console.log('BOOTSTRAP_LIQUIDITY_BEP20:READ_FAILED')}
 try{
  const post=chainJsonPost({endpoint:process.env.SIRO_TRON_RPC_URL!,apiKey:process.env.SIRO_TRON_RPC_API_KEY}),address=TronWeb.address.toHex(treasuryDestination('TRC20','operating'));
  const account=await post('/wallet/getaccount',JSON.stringify({address,visible:false}),signal) as {balance?:number};
  const token=await post('/wallet/triggerconstantcontract',JSON.stringify({owner_address:address,contract_address:TronWeb.address.toHex(tronUsdtContract),function_selector:'balanceOf(address)',parameter:address.slice(2).padStart(64,'0'),visible:false}),signal) as {constant_result?:string[]};
  console.log('BOOTSTRAP_LIQUIDITY_TRC20:'+JSON.stringify({nativeBaseUnits:account.balance??0,usdtBaseUnits:BigInt('0x'+(token.constant_result?.[0]??'0')).toString()}));
 }catch{console.log('BOOTSTRAP_LIQUIDITY_TRC20:READ_FAILED')}
}
main().catch(()=>console.log('BOOTSTRAP_FAILED_NO_CREDENTIAL_VALUES')).finally(()=>{console.log('BOOTSTRAP_COMPLETE_NO_PURCHASE_NO_BROADCAST_NO_DEPLOYMENT');process.exitCode=1});
