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

## Financial integration implemented, 2026-11-01

- `dual-resource-provider.ts` composes CatFee ENERGY and TronRental BANDWIDTH.
  The production worker opts in using `SIRO_TRONRENTAL_BANDWIDTH_ENABLED=true`.
  Default is off; all existing worker, purchase, signer and broadcast gates remain.
- Only deficits are purchased. When existing Energy suffices, the intent has zero
  Energy and a Bandwidth leg only. Traditional CatFee minimum remains 65000 units
  when an Energy purchase is needed. Bandwidth is sized to the missing resource.
- `ResourcePurchaseLeg` stores separate immutable provider identity, UUID request
  key, sender/quantity, quoted/actual costs, order ID, state and delegation hash.
- The parent reservation and all children commit atomically before either POST.
  Deferred DB enforcement requires the complete plan and exact combined total.
  Shared per-operation, global-held and network-day mutexes cover both providers;
  each child's known higher charge is immediately included in budget accounting.
- Each child is claimed once (READY -> UNKNOWN) before its external request. No
  automatic POST retry. CatFee recovery uses its original child UUID. TronRental
  recovery uses the saved numeric order ID and checks target/type/quantity/duration.
  If its POST response is lost, no documented read-by-idempotency-key exists:
  keep UNKNOWN, retain the full budget and stop for provider-assisted reconciliation.
  Never guess an order by address, issue a new key, or release an uncertain charge.
- Active-account proof checks the configured TRON genesis, a fresh solid head and
  the exact account address before Bandwidth purchase. No activation consent is
  granted. Quote expiry is rechecked after the proof; `max_price_trx` and the saved
  `Idempotency-Key` are always sent. Unexpected activation charges hold the flow
  and disable further purchases, rather than concealing the additional cost.
- TRON free and staked/delegated Bandwidth are **not additive** for a single
  transaction. Preflight, delivery and final byte-size authorization now use the
  larger individual bucket, not their sum. If free Bandwidth is insufficient,
  rental targets the deficit in the delegated bucket, not a fictitious combined
  pool. The split-bucket end-to-end regression (free300 + delegated200) buys the
  missing300 delegated units for a full500-unit bucket before signing.
  Reference: https://developers.tron.network/docs/paying-for-resources
- Every successful child needs an independently verified solid native delegation
  contract with the matching resource type and receiver. Current resources must
  suffice; the original independent pre-sign and exact signed-byte dispatch checks
  remain in place. A provider ACK is never permission to sign or broadcast.
- Legacy energy-only claims still reconcile with the original CatFee request ID.

Production migration `20261101040000_dual_resource_orders` was applied and verified:
checksum `32fb187e6de18c6ba9acdb31843d62677117a4ba185e097326ddcb2e01c85e69`,
RLS enabled, app/anon denied, financial worker SELECT/INSERT/UPDATE permitted,
both guards present, zero child rows and zero parent purchase attempts. Purchase
policy remains disabled. No financial flags or caps were increased.

Validation: full npm test PASS; local Next production build PASS; real PostgreSQL
17.11 PASS with 16 independent sessions, including the new competing-intent budget
acceptance. PGlite also runs the same child-budget acceptance. Adapter-level cycles
cover both resources and Bandwidth-only through signing, exact-byte broadcast and
settlement, plus timeout/no-repeat, inactive account, extra activation cost and
wrong-resource proof failures. All paid operations in those tests are synthetic.

**Not live-accepted:** the historical verified account balance was zero. No real
Bandwidth buy, paid delivery, buy-scope verification, sweep or payout was performed.
Do not confuse completed software integration with funded operational acceptance.
Keep financial execution disabled until a separately authorized funded test passes.
No automatic provider refill, TronZap fallback, Seamless activation, customer debit,
identity reactivation, or native TRX burn fallback was introduced.

## Provider documentation consulted

- https://docs.tronrental.com/api-reference/account/get-balance.md
- https://docs.tronrental.com/api-reference/bandwidth/quote.md
- https://docs.tronrental.com/api-reference/bandwidth/buy-bandwidth.md
- https://docs.tronrental.com/api-reference/account/api-key-scopes.md

The write API documents `max_price_trx` and `Idempotency-Key`. Activation of an
inactive target is charged **outside** max_price_trx, so independent active-account
proof is mandatory before any future buy. No automatic activation authorized.

## Production publication and final validation

Production deployment `dpl_8P5k7cSwv3mxNsMKykCaFERGW1Lm` is READY/PROMOTED,
source `f1899913cbb7d86117a902657173aaf5d0b29149`. Aliases were assigned by
Vercel; the public https://sirocash.vercel.app/ landing page was fetched successfully.
This is software publication, **not** financial activation or custom-domain DNS proof.

The hosted build verified all 30 financial/auth tables, RLS/app isolation, the new
guards, restricted DB TLS/session role, owner-only LISTEN delivery and read-only
financial projections. Financial activation configuration remained false, including
worker, purchase, signing, preparation, authorization, broadcast and withdrawals.
The deposit-readiness probe was skipped by its existing disabled configuration:
this publication is not a new live TRON/BSC RPC/finality or deposit-readiness check.
No financial env variable or provider balance was changed during this work.

The earlier source141175a deployment `dpl_AGzgZR5Znui3c4jYypZDy473HsPL`
was canceled before publication to replace it with the split-Bandwidth fix.
No temporary probe variables were created this turn.

The final software passed full npm test and production build after the split-bucket
fix. The real multi-session acceptance suite passed on PostgreSQL **16.15 and
17.11**, with 16 sessions each. These local runs did not request the optional
pg_dump/pg_restore drill; existing CI can run that separately. Both isolated
servers were stopped after testing. No downloaded database binaries or generated
logs/data were added to Git.
