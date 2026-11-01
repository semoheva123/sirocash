# TronRental Bandwidth integration status

## Verified live on 2026-11-01

Diagnostic `dpl_6b7eeuHzNEBjeMjLNKzEtvWyHMjv`, source
`cc9dbf1c759794de63383315e929b9cbf5230531`:

- The Vercel-held `TRONRENTAL_API_KEY` authenticated on GET `/v1/account/balance`.
- Balance: 0 SUN (0 TRX).
- Authenticated GET `/v1/bandwidth/quote/me?volume=1000&duration=1h`:
  total 600000 SUN (0.6 TRX), including fixed fee 200000 SUN (0.2 TRX).
- No purchase, activation, subscriptions, withdrawals, broadcasts or DB operations.
- Diagnostic intentionally exits nonzero before publication even on success.
- Temporary `SIRO_TRONRENTAL_LIVE_READ_PROBE_ONLY` variable
  `voZk4FLfQzU1auQ3` was deleted successfully afterward. The API key was not deleted,
  decrypted, exported or logged.

Earlier diagnostic `dpl_4Pz8n7U7gLfqJLfjzBw3XDSaeNLL` authenticated successfully but
stopped at an overly strict personal-price assertion. `personal_price=false` means
no negotiated rate, not necessarily invalid credentials. Corrected implementation
uses `/quote/me`, which requires authentication, rather than the public quote's
silent invalid-key fallback. The corrected diagnostic passed.

## Implemented and tested

`lib/tronrental-read.ts` is a server-only GET-only boundary. Fixed host and path
allowlist, X-API-Key header, no redirects/retries, bounded response, timeout,
exact decimal-to-SUN conversion, quantity/duration/total binding. No float money.
The build probe is opt-in and otherwise no-op. Tests cover public-rate accounts,
auth/permission failures, invalid totals, limits, secret redaction, action guards,
first-failure stop and intentional publication prevention.

Full `npm test` passed after the authenticated quote fix and probe safety suite
(131690ms). Synthetic tests are not paid provider acceptance tests.

## Not implemented / not proven

This is **not** an operational Bandwidth purchasing integration. The production
outbox still uses the traditional CatFee energy-only adapter and stops on
inadequate Bandwidth. No changes to its financial gates, caps or chain proof.

Before enabling combined resource purchasing, implement durable child claims for
both providers (provider identity, immutable target/quantity, own request key,
quoted/actual charges and independent receipt recovery). Reserve their combined
cost under the existing shared per-operation/day locks **before** either purchase.
An unknown outcome must not issue a new order or release budget. Do not hide two
purchases behind the existing single-provider order ID/receipt.

A funded paid test, buy_bandwidth entitlement and actual on-chain delegation have
not been verified. Do not claim pricing success proves these. A zero balance is
not a reason to activate buys, nor a reason to demand a large activation deposit.

## Provider documentation consulted

- https://docs.tronrental.com/api-reference/account/get-balance.md
- https://docs.tronrental.com/api-reference/bandwidth/quote.md
- https://docs.tronrental.com/api-reference/bandwidth/buy-bandwidth.md
- https://docs.tronrental.com/api-reference/account/api-key-scopes.md

The write API documents `max_price_trx` and `Idempotency-Key`. Activation of an
inactive target is charged **outside** max_price_trx, so independent active-account
proof is mandatory before any future buy. No automatic activation authorized.
