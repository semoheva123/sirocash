import assert from 'node:assert/strict';
import { planTronEnergy, quoteTronBid, trxToSun } from '../lib/tron-energy';
const catalog = [65000, 131000, 196500].map(energy => ({ energy, durationMinutes: 60 as const }));
assert.equal(planTronEnergy(64000, 64000, catalog).package, null);
assert.equal(planTronEnergy(130000, 65000, catalog).package?.energy, 65000);
assert.equal(planTronEnergy(130285, 0, catalog).package?.energy, 131000);
assert.throws(() => planTronEnergy(200000, 0, catalog));
assert.throws(() => planTronEnergy(-1, 0, catalog));
assert.throws(() => planTronEnergy(0, 0, catalog));
assert.equal(trxToSun('1.440001'), 1440001n);
for (const invalid of ['1e3', '-1', '0.0000001', 'NaN', '01']) assert.throws(() => trxToSun(invalid));
const pack = catalog[0];
let requests = 0;
const mock = (body: unknown, status = 200): typeof fetch => async (url, init) => {
  requests++;
  assert.equal(url, 'https://tronbid.com/api/v2/quick-rent/quote');
  assert.equal(init?.redirect, 'error');
  assert.deepEqual(JSON.parse(String(init?.body)), { energy_amount: 65000, duration_minutes: 60 });
  return new Response(JSON.stringify(body), { status });
};
async function main() {
  const options = { apiKey: 'test-only', maxRentalSun: 2000000n, now: () => 1000 };
  const quote = await quoteTronBid(pack, { ...options, fetcher: mock({ available: true, price_trx: '1.440000', expires_in_sec: 30 }) });
  assert.equal(quote.priceSun, 1440000n);
  assert.equal(quote.expiresAt, 31000);
  for (const body of [null, {}, { available: false },
    { available: true, price_trx: '3', expires_in_sec: 30 },
    { available: true, price_trx: '0', expires_in_sec: 30 },
    { available: true, price_trx: '1', expires_in_sec: -1 }]) {
    await assert.rejects(quoteTronBid(pack, { ...options, fetcher: mock(body) }));
  }
  await assert.rejects(quoteTronBid(pack, { ...options, fetcher: mock({}, 429) }));
  let clock = 0;
  await assert.rejects(quoteTronBid(pack, { ...options, now: () => clock++ * 40000, fetcher: mock({ available: true, price_trx: '1', expires_in_sec: 30 }) }));
  assert.equal(requests, 9);
  console.log('TRON energy planning and quote tests passed (mock transport; no purchases).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
