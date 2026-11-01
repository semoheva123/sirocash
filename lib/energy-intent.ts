/** Durable preparation only. This module cannot purchase energy or release funds. */
import { createHash, randomUUID } from 'node:crypto';
import type { WalletDb } from './wallet-engine';
import type { EnergyPackage } from './tron-energy';

type Prepare = {
  withdrawalId: string;
  /** Trusted, provisioned sender; caller must verify Base58Check and custody ownership. */
  senderAddress: string;
  package: EnergyPackage;
  maxRentalSun: bigint;
};
export async function prepareEnergyIntent(db: WalletDb, input: Prepare): Promise<{ id: string; requestKey: string; state: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.withdrawalId) ||
      !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(input.senderAddress) ||
      !Number.isSafeInteger(input.package.energy) || input.package.energy <= 0 ||
      ![15, 60].includes(input.package.durationMinutes) || input.maxRentalSun <= 0n || input.maxRentalSun > 9223372036854775807n) throw new Error('INVALID_ENERGY_INTENT');
  const withdrawalId = input.withdrawalId.toLowerCase();
  const requestKey = `energy:tronbid:v1:${withdrawalId}`;
  const fingerprint = createHash('sha256').update(JSON.stringify([
    withdrawalId, 'TRON', 'tronbid', input.senderAddress, input.package.energy,
    input.package.durationMinutes, input.maxRentalSun.toString(),
  ])).digest('hex');
  return db.transaction(async tx => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    const { rows: [withdrawal] } = await tx.query('SELECT kind,state,destination FROM "WalletOperation" WHERE id=$1 FOR UPDATE', [withdrawalId]);
    if (!withdrawal || withdrawal.kind !== 'WITHDRAWAL' || !['RESERVED', 'SUBMITTED'].includes(String(withdrawal.state)) ||
        !String(withdrawal.destination).startsWith('USDT:TRC20:')) throw new Error('INELIGIBLE_ENERGY_WITHDRAWAL');
    await tx.query(`INSERT INTO "EnergyRentalIntent" (id,"withdrawalId","senderAddress","requestKey",fingerprint,"energyAmount","durationMinutes","maxRentalSun")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT ("withdrawalId") DO NOTHING`,
    [randomUUID(), withdrawalId, input.senderAddress, requestKey, fingerprint, input.package.energy, input.package.durationMinutes, input.maxRentalSun.toString()]);
    const { rows: [row] } = await tx.query('SELECT id,"requestKey",state,fingerprint FROM "EnergyRentalIntent" WHERE "withdrawalId"=$1 FOR UPDATE', [withdrawalId]);
    if (!row || row.fingerprint !== fingerprint) throw new Error('ENERGY_IDEMPOTENCY_CONFLICT');
    return { id: String(row.id), requestKey: String(row.requestKey), state: String(row.state) };
  });
}
