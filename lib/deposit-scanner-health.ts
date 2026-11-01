import type {WalletDb} from './wallet-engine';
/** Reception follows actual scanner liveness, not a deployment flag alone. No owner data. */
export async function depositScannerHealthy(db:WalletDb){
 return db.transaction(async tx=>{
  const {rows:[r]}=await tx.query('SELECT count(*)=2 AND bool_and(NOT paused AND "lastSuccessAt">clock_timestamp()-interval \'10 minutes\' AND "lagBlocks"<=CASE WHEN network=\'TRC20\' THEN 300 ELSE 2000 END) AS healthy FROM "DepositNetworkScanner"');
  return r?.healthy===true;
 });
}
