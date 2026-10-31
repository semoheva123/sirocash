# Production wallet provisioning readiness

Status: **NOT cleared for funded production use.** Local financial preparation and fixture tests do not close the live launch gates.

Completed preparation includes dual-network public derivation, restricted offline signing, immutable quotes, durable device approval storage, deposit valuation/journal composition, reserved withdrawals, exact-byte payout persistence, private dispatch orchestration, synthetic finality-to-journal reconciliation and native payout expense claims.

Before asking the owner to provision production keys:
- Complete reviewed mainnet observers/simulation and endpoint/auth setup for both networks; verify actual provider behavior read-only.
- Complete resource-order pre-purchase budget claim, paid-order idempotency/outbox, delivery/unknown-order reconciliation; owner funding provider is not permission to make a paid purchase.
- Integrate combined sweep+payout expenses, all operating nonce consumers and funded crash/reorg/failed-execution recovery.
- Review quote/pricing authority, runtime grants and migrations, real PostgreSQL separate-session concurrency, real-device ceremonies/credential recovery, full server quote-confirm UX and scheduler authorization.
- Explicitly approve a small funded drill only after those checks; deposits UI stays gated until then.

When cleared: use independent HD deposit accounts, separate from operating/reserve wallets and from all test seeds. Verify first derived public addresses and account binding offline, and prove backup/recovery on a safe independent device before funding. Vercel-only software signing is hot custody, not HSM isolation; secret visibility/runtime compromise can expose funds. Add production secrets directly to the production secret store only after review. Never put phrases/xprv/private keys in chat, source, build logs, browser code or Preview environments. No owner secret is needed for fixture tests or remaining programming.

Do not fund deterministic fixture/test addresses or reuse test phrases as production custody. No production secret values or seed are recorded in this document.
