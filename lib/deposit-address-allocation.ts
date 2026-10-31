/** Private allocation service; caller must supply authenticated owner and trusted vault configuration. */
import { randomUUID } from 'node:crypto';
import type { WalletDb } from './wallet-engine';
import { deriveTronDepositAddress } from './tron-addresses';
import { deriveBep20DepositAddress } from './evm-deposit-addresses';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function allocateDepositAddress(db: WalletDb, ownerId: string, vaultId: string, network: 'TRC20' | 'BEP20') {
 if(network!=='TRC20'&&network!=='BEP20')throw new Error('UNSUPPORTED_DEPOSIT_NETWORK');
 if (!uuid.test(ownerId) || !uuid.test(vaultId)) throw new Error('INVALID_ADDRESS_OWNER_OR_VAULT');
 return db.transaction(async tx => {
  await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const { rows: [vault] } = await tx.query('SELECT * FROM "DepositAddressVault" WHERE id=$1 FOR UPDATE', [vaultId]);
  if (!vault || vault.network !== network || vault.enabled !== true || vault.originVerified !== true) throw new Error('DEPOSIT_VAULT_NOT_READY');
  // Serialize owners across vault rotation as well as indexes inside a vault.
  const { rows: [owner] } = await tx.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [ownerId]);
  if (!owner) throw new Error('DEPOSIT_OWNER_UNAVAILABLE');
  const { rows: [existing] } = await tx.query('SELECT address FROM "UserDepositAddress" WHERE "ownerId"=$1 AND network=$2', [ownerId,network]);
  if (existing) return { network, address: String(existing.address) };
  const index = Number(vault.nextIndex);
  const { address } = (network==='TRC20'?deriveTronDepositAddress:deriveBep20DepositAddress)(String(vault.accountXpub), index);
  await tx.query('INSERT INTO "UserDepositAddress" (id,"ownerId","vaultId",network,address,"derivationIndex") VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), ownerId, vaultId, network, address, index]);
  await tx.query('UPDATE "DepositAddressVault" SET "nextIndex"="nextIndex"+1 WHERE id=$1', [vaultId]);
  return { network, address };
 });
}

export function allocateTronDepositAddress(db:WalletDb,ownerId:string,vaultId:string){return allocateDepositAddress(db,ownerId,vaultId,'TRC20')}
export function allocateBep20DepositAddress(db:WalletDb,ownerId:string,vaultId:string){return allocateDepositAddress(db,ownerId,vaultId,'BEP20')}
