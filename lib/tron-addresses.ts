/** Watch-only TRON address derivation. No signing or private-key import. */
import { HDKey } from '@scure/bip32';
import { base58 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';

export function tronAccountPublicKey(xpub: string): HDKey {
  // Reject private extended keys and mnemonics BEFORE parsing. Never echo supplied input.
  if (typeof xpub !== 'string' || !/^xpub[1-9A-HJ-NP-Za-km-z]{100,110}$/.test(xpub)) throw new Error('PUBLIC_ACCOUNT_KEY_REQUIRED');
  let key: HDKey;
  try { key = HDKey.fromExtendedKey(xpub); } catch { throw new Error('INVALID_PUBLIC_ACCOUNT_KEY'); }
  if (key.privateKey || !key.publicKey || key.depth !== 3 || key.index < 0x80000000) throw new Error('ACCOUNT_LEVEL_XPUB_REQUIRED');
  return key;
}

/** Account origin m/44'/195'/account' must be verified OFFLINE; xpub cannot prove ancestry. */
export function deriveTronDepositAddress(accountXpub: string, index: number): { address: string; relativePath: string } {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 0x80000000) throw new Error('INVALID_ADDRESS_INDEX');
  const child = tronAccountPublicKey(accountXpub).deriveChild(0).deriveChild(index);
  if (!child.publicKey) throw new Error('PUBLIC_DERIVATION_FAILED');
  const publicBytes = secp256k1.ProjectivePoint.fromHex(child.publicKey).toRawBytes(false);
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(keccak_256(publicBytes.slice(1)).slice(-20), 1);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return { address: base58.encode(new Uint8Array([...payload, ...checksum])), relativePath: `0/${index}` };
}

export function validTronAddress(address: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false;
  try {
    const decoded = base58.decode(address);
    if (decoded.length !== 25 || decoded[0] !== 0x41) return false;
    const checksum = sha256(sha256(decoded.slice(0, 21))).slice(0, 4);
    return checksum.every((v, i) => v === decoded[21 + i]);
  } catch { return false; }
}
