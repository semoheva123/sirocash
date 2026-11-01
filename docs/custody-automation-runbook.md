# Custody automation: staged, not live

Trust Wallet is not the backend signer. Never paste/import existing recovery phrases into this application, its environment variables, the repository, chat, CI or Vercel. A reserve with automated signing is a connected reserve, not cold storage. Prefer a separately controlled offline emergency reserve as funds grow.

## Added now

- `lib/treasury-automation.ts`: base-unit-only policy for low-water/target refill, single-refill limit, daily budget, retained reserve, fee ceiling, fresh observations and reconciliation. Unknown/pending refills block another refill. Oversized requests do not silently split to bypass caps.
- This is a pure decision function, NOT a worker, lock, persistent budget counter, balance verifier or permission to broadcast. Example numbers in tests are fixtures, not an approved production policy.
- `custodyReadiness`: explicit missing-gate report; no financial environment switch or runtime activation added.

## Required before connecting two wallets

1. Provision separate-key operating and reserve wallets with an isolated signer. Public destination allowlists and policy must be enforced AT THE SIGNER, not only in web application code. Review provider/key ownership, backups, recovery and incident shutdown. Never request existing Trust Wallet seed phrases.
2. Define approved real thresholds independently for each network/asset, plus native-gas budgets and fee payer balances. The token reserve-floor calculation does NOT budget native fees. Verify native funds separately and atomically reserve concurrent budgets.
3. Add durable refill records, immutable command fingerprints, UTC daily reserved/submitted/confirmed spend counters, sender/account locks and signed transaction identities persisted before broadcast. Scope counters to real treasury ownership, not arbitrary client keys. Unknown results remain reserved until chain reconciliation; no blind replacement or failover.
4. Provision per-customer deposit attribution and verified chain watchers: exact network/token contract, decimals, transfer log index, finality/reorg handling, duplicate-event exclusion and approved USD valuation. A tx hash or receipt image is insufficient.
5. Finish persistent device approval and narrowly privileged database financial functions. Apply pending migrations only under a reviewed production change. Current runtime guards remain intact.
6. Finish energy procurement with provider credentials and enforceable price limits, independent delivery verification and resource allocation locks. Existing energy modules are preparation only.
7. Exercise real PostgreSQL concurrent spending, crashes after broadcast, delayed delegation, reorgs, fee spikes, signer compromise response and restore/reconciliation drills. Start with capped funded tests after explicit approval.

## Needed from owner (non-secret)

- Which supported network goes first: TRON or BNB Smart Chain.
- Public operating/reserve addresses on that network (not recovery phrases or private keys).
- Approved operating low-water/target, maximum refill and daily ceiling.
- Approval of a reviewed signing deployment and any associated paid service.

No provider account was provisioned, no seed was accessed, no database migration was remotely applied and no real-money service was activated by these modules.
