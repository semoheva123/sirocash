# Vercel operating-wallet signing — OFFLINE PREPARATION ONLY

## Implemented

`lib/vercel-treasury-signer.ts` is server-only and builds narrowly scoped USDT transfer transactions locally:
- BNB Smart Chain chain56, fixed USDT contract 0x55d398326f99059fF775485246999027B3197955 (18 token decimals), zero native value, fixed transfer selector, explicit nonce/gas caps. Does not support Ethereum USDT or arbitrary token contracts.
- TRON mainnet USDT contract TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t (6 token decimals), one TriggerSmartContract transfer, no native value, TAPOS reference fields, bounded expiry and fee_limit, protobuf-derived transaction ID checked before signature. TRON raw transaction does not contain an EVM-style chain ID: trusted caller must verify mainnet RPC/block provenance.
- Derived signing address must equal the configured operating sender. Amount/fee limits required. No arbitrary calldata, token approvals, native transfers, reserve-key load, mnemonic import, RPC call or broadcast implementation.
- `vercelSignerConfiguration` refuses unless VERCEL_ENV=production and SIRO_SIGNER_ENABLED=true; flag absent by default. The low-level offline primitives accept explicit key/policy for testing; caller policy is NOT authorization by itself. No HTTP route imports them and no deployment/secret change was made.

Tests use deliberately public fixture private keys, recover actual signatures and decode signed transactions. NEVER FUND FIXTURE ADDRESSES. No user's keys were accessed. No mainnet integration or security audit is claimed.

## Keys and residual risk

Only operating-wallet per-chain private keys would be read server-side from SIRO_TRC20_OPERATING_PRIVATE_KEY / SIRO_BEP20_OPERATING_PRIVATE_KEY when a reviewed live worker exists. They are NOT configured now. No seed phrases. Do not send them in chat or put them in NEXT_PUBLIC_ variables, git, logs, fixtures, cron URLs or browser requests. Use a reviewed secret-ingestion process and production-only sensitive storage; verify permissions/backups/recovery and decide whether the existing wallet keys can be safely exported. Public addresses are insufficient. No key-generation/export ceremony was performed. Do not extract the existing Trust Wallet recovery phrase on the web app.

Vercel environment secrets are readable by authorized runtime code. An app/deployment compromise can misuse keys despite these checks; this is not HSM/MPC isolation. Bundled signer must never be mistaken for an isolated signing service. Keep reserve offline and operating liquidity capped. No claim of platform-wide safety from these unit tests.

## Hard requirements before live execution

- Persist single-use device approval bound to exact operation, network, asset, recipient, gross/fee/net, fee-policy version and idempotency.
- Atomically claim operation, sender/nonce, liquidity and daily token/native/energy budgets using restricted database functions and independent-session PostgreSQL tests. Per-transaction signer caps do not enforce daily limits.
- Sweep destinations must be bound to the operating allowlist; payout destinations to exact verified approved command. Do not take policy or nonce from a public request body.
- Obtain trusted nonce, gas estimate, finalized network evidence and chain identifier; verify token metadata and fail closed on RPC disagreement. BSC18/TRON6 token units must not be confused with USD ledger micros.
- Energy rental must be reconciled and resources freshly rechecked; native fee caps are network budgets, not the user's fixed withdrawal tariff. Signature preparation does not rent resources.
- Persist signed bytes and TXID in a restricted durable outbox BEFORE broadcasting. Unknown outcomes reconcile the same transaction; retries cannot re-sign blindly with a new nonce/TAPOS window. Protect signed bytes from browser access: they are broadcastable authorizations.
- Implement broadcast/reconciliation workers, exact payout evidence matching, journal settlement/revenue posting and explicit failed-network-cost policy. No automatic hold release on timeout.
- Emergency stop, role review, recovery/restore, observability without secrets and controlled funded tests before owner authorizes activation.

Not deployed/activated; existing finance guards unchanged. Existing API demo routes cannot sign. This module alone does NOT complete automated sweep/withdrawal service.

## HD deposit sweeps and durable signing added

`signDepositSweep` derives external0/index child keys from a dedicated account0 xprv, checks exact account xpub and DB-assigned address, and uses the existing restricted USDT signer. Output always targets owner-confirmed operating address; arbitrary sweep destination is not accepted. Secret strings/copies cannot be guaranteed zeroized in JavaScript; HDKey objects receive best-effort wiping. No production key was imported, no public route, no broadcast.

`prepareSignedSweep` locks the durable source assignment, validates vault network/enabled/origin flags, checks exact configured public/private account binding, and persists signed bytes and TXID in one transaction. An exact retry returns existing metadata WITHOUT loading keys or re-signing; changed transactions conflict. Another unresolved sweep for the source is blocked. The pending migration uses RLS/no runtime grants and unique source/nonce guards. Does not expose signed bytes in its return value. Signed bytes are broadcastable authorizations; access must be tightly restricted. DB rollback discards a signature that was never broadcast.

This preparation is NOT a full worker. It does not attest chain balance/resources, lock global token/native/daily budgets, consume device approval, submit to a node, reconcile finality or post journals. Nonce uniqueness currently protects this sweep table, not a shared sweep+payout dispatch service. Future workers must use one shared sender/nonce/budget claim system before any live dispatch. Unknown or expired signed transactions must be reconciled, not replaced by a new request key. Reserve keys are not loaded.

Dedicated production secret names (NOT configured): SIRO_TRC20_DEPOSIT_ACCOUNT_XPRV / XPUB and SIRO_BEP20_DEPOSIT_ACCOUNT_XPRV / XPUB, with the common SIRO_ prefix per variable as implemented. These are account-level credentials, not root seeds. Never paste mnemonic/xprv in chat or source. Do not fund the chat test wallets. Provisioning/import/recovery procedure and account origin still require review.

Offline tests recover signatures for both networks and confirm fixed recipient and address matching; PGlite tests check persisted bytes, same-key replay and conflict/pending handling. No production readiness or independent PostgreSQL concurrency claim.
