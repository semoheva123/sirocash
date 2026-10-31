# Financial execution implementation — 2026-10-31

This is implementation progress, **not a completed launch or a production activation**.
The migration `20261031210000_sweep_dispatch_worker` is staged, not applied.
No paid request, live signing, broadcast, financial permission or funding change was made.

## Implemented in this patch

- Sweep dispatch on both networks: exact saved bytes, signature/calldata/chain/sender validation,
  fresh trusted resource evidence, shared payout/sweep expense-policy mutex and aggregate cap,
  durable UNKNOWN claim committed before send, no automatic resend, ACK distinct from finality.
- Sweep expense settlement only after immutable final successful exact Transfer evidence.
- Private bounded queue runner: persistent fair keyset checkpoint, exclusive fenced lease,
  expiry recovery, bounded batch/job deadlines and abort propagation into sends **and reads**.
  This is a callable worker, not an installed scheduler.
- Resource observer for both sweep and payout saved USDT transactions: BSC chain56,
  exact transfer simulation, pending nonce/native/token balance; TRON pinned genesis,
  account activation/native balance, actual resource availability, transfer energy simulation
  and token balance. Conservative bandwidth requirement includes JSON-size safety margin.
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
permission before any purchase. Neither permission is enabled or environment-wired.
The quoted budget check alone cannot guarantee the final upstream charge. A price
breach is exposed on read recovery; it must never be treated as a free/cancelled order.
Do not invent a provider max-price field or silently treat the $3 estimate as a guarantee.

## Still required before claiming complete automation

- Durable provider recovery/delivery/actual-charge settlement, including a purchase-price
  breach circuit breaker and treatment of failed/not-found orders without blind retry/refund.
- Connect the live resource observer and durable rental records to both authorization paths.
  The current worker processes existing saved/approved outboxes; it does not yet create all
  deposit sweeps or withdrawal signatures or authorizations automatically.
- Dedicated restricted financial DB authority and an authenticated scheduled trigger.
  Do not grant financial authority to `sirocash_app` or expose signed payloads in public APIs.
- Apply staged schema, configure trusted RPC/genesis and bounded policies, then deploy/test.
- Real PostgreSQL multi-connection concurrency tests and explicitly bounded paid/end-to-end
  mainnet tests. Offline fixture signatures and mocked transports are not such proof.

## Verification

Final combined verification: `npm test`, `npm run build` and `git diff --check` all
passed, including worker fairness/leases, sweep dispatch, live-resource fixture transport,
read cancellation and TronZap-order tests. Tests make no paid provider call.
