/** Private preparation layer. No signing, purchase, payout or public route. */
export type EnergyPackage = { energy: number; durationMinutes: 15 | 60 };
export type EnergyPlan = { required: number; available: number; missing: number; package: EnergyPackage | null };

function units(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid energy quantity');
  return value;
}

/** Estimates must come from trusted chain simulation, never customer input. */
export function planTronEnergy(required: number, available: number, catalog: EnergyPackage[]): EnergyPlan {
  units(required); units(available);
  if (required === 0) throw new Error('Missing transaction estimate');
  const missing = Math.max(0, required - available);
  if (!missing) return { required, available, missing, package: null };
  // Prefer one hour to allow for confirmation/recovery. Catalog must be refreshed before quoting.
  const candidates = catalog.filter(item => {
    units(item.energy);
    if (item.durationMinutes !== 15 && item.durationMinutes !== 60) throw new Error('Invalid rental duration');
    return item.durationMinutes === 60 && item.energy >= missing;
  }).sort((a, b) => a.energy - b.energy);
  if (!candidates.length) throw new Error('No eligible energy package; withdrawal must wait');
  return { required, available, missing, package: { ...candidates[0] } };
}

export function trxToSun(value: string): bigint {
  if (!/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(value)) throw new Error('Invalid TRX amount');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

export type EnergyQuote = { priceSun: bigint; expiresAt: number; package: EnergyPackage };

/** Read-only price request: deliberately has no order-creation/payment capability. */
export async function quoteTronBid(
  pack: EnergyPackage,
  options: { apiKey: string; maxRentalSun: bigint; fetcher?: typeof fetch; now?: () => number },
): Promise<EnergyQuote> {
  units(pack.energy);
  if (!pack.energy || ![15, 60].includes(pack.durationMinutes)) throw new Error('Invalid package');
  if (!options.apiKey || /[\r\n]/.test(options.apiKey) || options.maxRentalSun <= 0n) throw new Error('Missing server quote configuration');
  const now = options.now ?? Date.now;
  const started = now();
  const response = await (options.fetcher ?? fetch)('https://tronbid.com/api/v2/quick-rent/quote', {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ energy_amount: pack.energy, duration_minutes: pack.durationMinutes }),
  });
  // Never log response bodies or secrets; do not retry an ambiguous paid operation here.
  if (!response.ok) throw new Error(`Energy quote unavailable (${response.status})`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object') throw new Error('Invalid energy quote');
  const data = body as Record<string, unknown>;
  if (data.available !== true || typeof data.price_trx !== 'string' ||
      typeof data.expires_in_sec !== 'number' || !Number.isSafeInteger(data.expires_in_sec) ||
      data.expires_in_sec <= 0 || data.expires_in_sec > 3600) throw new Error('Unavailable or invalid energy quote');
  const priceSun = trxToSun(data.price_trx);
  if (priceSun <= 0n || priceSun > options.maxRentalSun) throw new Error('Energy rental exceeds approved budget');
  const expiresAt = started + data.expires_in_sec * 1000;
  if (now() >= expiresAt) throw new Error('Energy quote expired');
  return { priceSun, expiresAt, package: { ...pack } };
}
