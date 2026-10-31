import type {WalletTx} from './wallet-engine';
/** Caller MUST hold the network PayoutExpensePolicy row lock. Outstanding provider attempts
 * remain reserved; their cost is conservatively counted even if already part of a dispatch
 * reservation. This can stop early but cannot create a second independent daily spending pool.
 */
export async function nativeExpenseUsage(tx:WalletTx,network:'TRC20'|'BEP20'){
 const {rows:[row]}=await tx.query(`SELECT COALESCE(sum(n),0)::text AS used FROM (
 SELECT "amountBaseUnits" AS n FROM "PayoutExpenseReservation" WHERE network=$1 AND (state='HELD' OR "settledAt">=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
 UNION ALL SELECT expense FROM "SweepDispatchAuthorization" WHERE network=$1 AND (state='HELD' OR "settledAt">=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
 UNION ALL SELECT expense FROM "NativeGasOutbox" WHERE $1='BEP20' AND (state<>'CONFIRMED' OR "confirmedAt">=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
 UNION ALL SELECT GREATEST("costSun",COALESCE("actualCostSun",0)) FROM "EnergyPurchaseAttempt" WHERE $1='TRC20'
 ) q`,[network]);
 return BigInt(String(row.used));
}
