> **Provider cutover (2026-11-01): CatFee is the sole selected provider.** See [current integration and launch restrictions](catfee.md). References to the former provider below are historical implementation/observation records, not active configuration. Do not restore its keys or roll back to its adapter.

# Financial execution implementation — 2026-10-31

This is implementation progress, **not a completed launch or a production activation**.
Migrations `20261031210000_sweep_dispatch_worker`,
`20261031220000_energy_delivery_recovery` and `20261031230000_financial_worker_role`
and `20261031240000_autonomous_financial_execution` were applied in order on 2026-10-31.
Production now has 36 finished Prisma migration records with matching checksums for these four.
Verified: 26 tables with RLS, no anon/authenticated access, application access limited to
the three existing authentication/approval tables, nine checked guards and five safety indexes.
The dedicated worker is NOLOGIN/NOBYPASSRLS, with no application/public membership.
Supabase created a postgres ADMIN-only membership (INHERIT=false, SET=false).
Energy purchase and both network payout policies remain disabled. Restricted worker grants
were installed; no login credential, paid request, live signing, broadcast, funding change
or production application redeployment was performed.

## Implemented in this patch

- Sweep dispatch on both networks: exact saved bytes, signature/calldata/chain/sender validation,
  fresh trusted resource evidence, shared payout/sweep expense-policy mutex and aggregate cap,
  durable UNKNOWN claim committed before send, no automatic resend, ACK distinct from finality.
- Sweep expense settlement only after immutable final successful exact Transfer evidence.
- Private bounded queue runner: persistent fair keyset checkpoint, exclusive fenced lease,
  expiry recovery, bounded batch/job deadlines and abort propagation into sends **and reads**.
  Includes ENERGY preparation/recovery jobs and a two-minute batch processing deadline.
  A protected trigger and scheduled workflow now exist in code; neither is activated.
- Resource observer for both sweep and payout saved USDT transactions: BSC chain56,
  exact transfer simulation, pending nonce/native/token balance; TRON pinned genesis,
  account activation/native balance, actual resource availability, transfer energy simulation
  and token balance. Bandwidth uses exact signed protobuf size plus the protocol
  64-byte maximum result allowance, not JSON-size (which unnecessarily blocked free bandwidth).
  With sufficient proven energy and bandwidth, TRON does not require an unnecessary
  full fee-limit native prefund; BEP20 still requires enough BNB for the full signed gas budget.
  Output is not a receipt/finality proof and RPC endpoints remain operator-trusted.
  Rental cost must be supplied from durable verified purchase records, never customer input.
- TronZap paid-order adapter: official exact JSON request signing, fresh reprice before create,
  external-ID lookup for recovery, binding to address/energy/duration/service/external ID,
  actual charge and price-breach reporting. No retries, including on order-not-found.
  Strict unsupported response shapes are held, not guessed into success.

## Provider contract and important limitation

Request shapes pinned to official SDK:
- https://github.com/tron-energy-market/tronzap-sdk-nodejs/tree/2c59b7870fc488d81d1dee643c556ecea0d42eb4
- Typed response model (`Transaction`, `Calculation`, `TransactionParams`):
  https://github.com/tron-energy-market/tronzap-sdk-go/blob/36c9a04566d82529a2c6d0c8233aa342dc5e6686/models.go

`POST /v1/transaction/new` uses `service`, `params` and `external_id`.
`POST /v1/transaction/check` accepts `external_id`. A provider external ID is **not**
proof of create idempotence. ACK/success reported by the provider is not proof of
usable on-chain resources. Amount is charged TRX, converted exactly to SUN.

The documented create request has **no atomic maximum-price/quote-lock parameter**.
A calculation is not a hard price cap. The adapter therefore requires both
`purchaseEnabled` and a separate explicit `acceptVariableProviderPrice` operator
permission before any purchase. Both permissions are privately environment-wired but
remain disabled; absent variable-price acceptance, the worker does not even claim a purchase.
The quoted budget check alone cannot guarantee the final upstream charge. A price
breach is exposed on read recovery; it must never be treated as a free/cancelled order.
Do not invent a provider max-price field or silently treat the $3 estimate as a guarantee.

## Recovery/execution and scheduling added

- `energy-recovery.ts` recovers UNKNOWN orders using the **persisted claim UUID**, never
  creates a new order and never releases a reservation on not-found, failure or timeout.
  Learns immutable final actual charge even if delivery proof is unavailable. Known overruns
  count toward provider exposure (`max(quote, actual)`), and atomically disable further
  purchases when individual or aggregate limits are breached. No automatic re-enable/refund.
- `energy-delivery-observer.ts` requires pinned genesis, successful solid transaction inclusion,
  native ENERGY delegation (or matching BANDWIDTH delegation for a resource bundle) to the
  exact intended receiver, current usable energy and purchased bandwidth, recent solid
  head and a canonical block recheck. Unsupported proxy/bundled shapes stay HELD. A provider
  success response alone is never accepted as delivery. Proof expires within 25 seconds.
- `financial-execution.ts` composes prepared-intent quote/purchase/recovery and both outbox
  authorization paths with live resource observations and durable verified rental charges.
  `outbox-network-runtime.ts` invokes this before normal dispatch/finality, still observing
  existing transfers when authorization fails. Existing approvals never authorize a resend.
- `financial-database.ts` requires an independent financial credential with strict TLS and
  checks the actual DB role, absence of admin/RLS bypass/auth-runtime membership and absence
  of password/session access before every transaction. No fallback to `DATABASE_URL`.
- Role migration creates **NOLOGIN** `sirocash_financial_worker`: scoped financial grants,
  no authentication credentials/session access, read/lock-only custody configuration, no
  changes to spend limits, and only a false-valued update for the purchase circuit breaker.
  Energy intent identity/budget fields cannot be rewritten by recovery.
- `POST /api/internal/financial-worker` requires a dedicated constant-time checked secret,
  production and enabled-worker gates. Accepts no operation command/evidence from its caller;
  responds with counts only. GitHub workflow invokes it every five minutes with no HTTP retries.
  GitHub scheduled workflows run from the default branch after merge; this PR branch is NOT
  an active schedule. Schedules are best-effort, not a real-time execution guarantee.

## Configuration (not activated)

The reviewed private runtime accepts `FINANCIAL_DATABASE_URL` (dedicated role only),
`SIRO_FINANCIAL_WORKER_SECRET` (same separately stored secret in deployment and GitHub),
`SIRO_OUTBOX_WORKER_ENABLED`, `SIRO_RESOURCE_AUTHORIZATION_ENABLED`,
`SIRO_ENERGY_WORKER_ENABLED`, `SIRO_ENERGY_PURCHASE_ENABLED`,
`SIRO_ACCEPT_VARIABLE_ENERGY_PRICE`, plus existing trusted RPC/genesis, signer and broadcast
configuration. Do not put financial credentials in preview or browser variables. The NOLOGIN
role requires separately secured credential provisioning; the migration intentionally creates
no plaintext password or public-role membership. No flag or production value was changed.

## Previously identified execution gaps — now implemented

Automatic reserved-quote/deposit preparation and signing, bounded BEP20 native prefunding,
and audited expired approval/unclaimed TRON signature recovery are now wired into the batch.
See [implementation acceptance](autonomous-financial-execution.md) for the exact graph,
conservative failure handling, configuration and fixture evidence. These are no longer absent
functions. The schema gate now expects 26 protected tables and nine checked triggers.

Production installation/configuration, real funded acceptance and the other platform launch
requirements are not claimed complete. No production credential/flag or financial effect was
changed. The linked acceptance document explicitly separates execution-code scope from launch.

## Verification

Final combined verification: `npm test`, `npm run build` and `git diff --check` all
passed, including worker fairness/leases, sweep dispatch, live-resource fixture transport,
read cancellation, TronZap-order recovery/circuit breaker, solid ENERGY delivery,
worker-role denial/row-locking, authenticated route and dual-network autonomous-cycle tests. Tests make no paid provider call.
