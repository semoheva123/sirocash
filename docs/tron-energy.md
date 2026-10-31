# TRON energy preparation — NOT LIVE

## Implemented

`lib/tron-energy.ts` plans the remaining energy gap using trusted chain estimates and available sender resources. It chooses the smallest eligible one-hour package from an injected, refreshed catalog. No hard-coded price or guaranteed 65k/131k estimate. A read-only TronBid quote client validates decimal TRX exactly, availability, expiration and a configured rental-only budget. Requests have a timeout, disallow redirects and do not cache secrets/responses. There is deliberately no purchase, signing or public endpoint.

`npm run test:energy` uses mock HTTP only. It does not prove provider availability, authenticity of delivery, API credentials, or custody readiness.

## Before purchase support

- Obtain API access via the provider's official dashboard. Never send credentials in chat. Balance payment needs separate provider enablement. No account was created or funded by this change.
- Refresh/validate the live package catalog; estimate the exact USDT contract call and sender resources from trusted TRON RPC. Validate address checksums, network and canonical token contract. Never trust customer-supplied estimates or sender addresses.
- Budget ALL expenses: rent, payment bandwidth, USDT bandwidth, activation if applicable and possible resource shortfall. A rental-only cap is not a total withdrawal-cost cap.
- Add a durable rental-intent table keyed to the immutable withdrawal operation. Persist exact sender/network/package/quote/policy fingerprint and idempotency key BEFORE dispatch; lease/lock sender resources to prevent simultaneous allocation to two withdrawals.
- Current API docs do not establish an enforceable maximum-price parameter on balance-mode order creation. A prior quote does not by itself cap the charged price. Resolve this with the provider before balance-mode purchasing; do not automate uncapped charging.
- Unknown create/payment outcomes remain pending reconciliation using the SAME key/order/transaction IDs. No new order, no provider fallback, no automatic hold release while outcome is uncertain.
- Independently verify delegation transaction finality, target, usable resources and remaining duration on chain. A provider status alone cannot authorize payout.
- Sign withdrawals through an isolated signer, never a Trust Wallet seed in Next.js/Vercel. Persist signed transaction identity before broadcast and reconcile before replacement. Energy delivery is not payout completion.
- Retry budget/leases, database privileges, persistent device approvals, real PostgreSQL concurrency and limited funded integration tests remain required. Normal registered-user finance guards stay intact.

## Provider reference reviewed 2026-10-31

https://tronbid.com/en/rent-tron-energy-api

Documented quote: POST /api/v2/quick-rent/quote with energy_amount and duration_minutes; price_trx, available, expires_in_sec. API-key access is not provisioned. Published prices are not a guarantee or independent reliability assessment. No fallback provider has been integrated.

## Durable preparation added

`prepareEnergyIntent` and migration `20261031020000_energy_intents` stage one immutable-fingerprint rental intent per reserved/submitted USDT/TRC20 withdrawal. Retrying unchanged input returns the same key; repricing/changing sender conflicts. A partial unique index prevents two unresolved preparations allocating the same sender. RLS is enabled without application grants. Preparation never changes held funds or submits a withdrawal.

This migration has NOT been remotely applied. The address syntax check is not Base58Check or custody verification; the trusted caller must provide those. No public caller exists. Dispatch/state-transition/reconciliation workers are not implemented: PREPARED intents intentionally stay blocked, and the table's other status labels are reserved for that future reviewed worker, not proof of delivery. Never manually mark DELIVERED to unlock a payout. The provider price-cap question and isolated signing remain hard activation gates.
