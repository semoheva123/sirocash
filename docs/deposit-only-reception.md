# Deposit-only reception (requested 2026-11-01)

The owner explicitly approved leaving funds in assigned customer subaddresses and deferring collection. CatFee resources, native funding, signing, sweeping, payout and internal transfers are **not prerequisites** for this narrower mode. Their full-execution restrictions are unchanged.

## Isolation

`SIRO_DEPOSIT_ONLY_ENABLED=true` selects a separate read/credit worker composition. Only `DEPOSIT_SCAN` and `DEPOSIT_VALUE` jobs can be selected. Saved payout/sweep/energy/gas jobs cannot be dispatched. Signing, broadcast, automatic preparation, native gas, resource authorization, energy worker/purchases and withdrawals must not be enabled. A conflict fails closed. All customer debit/prepare APIs remain denied even if the generic customer-finance flag is accidentally enabled. Status advertises transfers=false and withdrawals=false; the payment screen hides debit forms. Address allocation retains authenticated session/owner and trusted vault checks. USD ledger valuation still uses observed USDT/USD pricing, never a forced peg. No per-customer private key is sent to the browser.

## Not yet activated

This change implements isolation, not a production reception certificate. No deposit-only/worker/customer gates have been switched on. No addresses were assigned, deposits posted or funds moved during this change.

Operational findings before customer reception:

- The default branch is `main`. GitHub returned 404 for `.github/workflows/financial-worker.yml` on that branch; a workflow existing only on the working branch does not establish scheduled execution.
- The current scanner processes at most one block and three TRON transactions per address job, in a shared worker limited to five jobs per invocation. The existing five-minute schedule is not evidence that it can keep up with mainnet. Opening reception on this path would create an accumulating credit backlog; throughput and lag must be addressed and tested first.
- The configured BEP20 endpoint must support filtered USDT `eth_getLogs`, not just chain ID/head/finalized reads. A read-only opt-in build probe tests this separately, plus solid TRON reads and the pricing endpoint. Its output does not activate anything or certify scan capacity.
- Both networks still require finality/discovery acceptance, verified custody bindings and an end-to-end bounded deposit/credit acceptance test before addresses are exposed to customers.

Build diagnostics can be requested with `SIRO_DEPOSIT_READINESS_PROBE=true` while financial execution is disabled. Diagnostics log allowlisted status/public chain metadata only, never credentials, account data or provider bodies.
