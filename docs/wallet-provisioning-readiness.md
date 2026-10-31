> **Provider cutover (2026-11-01): CatFee is the sole selected provider.** See [current integration and launch restrictions](catfee.md). References to the former provider below are historical implementation/observation records, not active configuration. Do not restore its keys or roll back to its adapter.

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

## Production bootstrap and guarded rollout (2026-11-01)

The one-use database bootstrap has completed and its temporary SQL function was dropped.
Both production vaults were privately matched to the configured custody material; the independent
financial-worker LOGIN was verified over TLS. No secret was exported and no signed transaction,
resource purchase or broadcast was performed. The observed provider balance and both operating
wallets' native/token balances were zero. These are observations, not a guarantee of future liquidity.

Approved expense policies remain disabled pending funded readiness. Approved minimum sweeps are
25 USDT TRC20 and 10 USDT BEP20. Staged native fee limits are 10 TRX (leaving at most 40 TRX for
resources within the 50 TRX operation cap) and 0.001 BNB. The shared native daily budget now includes
provider purchase claims *before* external purchase under the same network policy row lock used by
sweep/payout authorization. Uncertain/provider claims remain conservatively reserved, including
across UTC days. Some costs can deliberately be counted twice; budget release/reconciliation is
not implied. This prevents independent spending pools but does not turn a variable provider quote
into a guaranteed maximum charge.

`SIRO_WITHDRAWALS_ENABLED` separately defaults off; internal customer-finance activation cannot
reserve a withdrawal while this gate is off. The customer UI also receives separate deposit and
withdrawal capabilities. Deposit intake stays disabled until the complete funded acceptance path
is safe. Full configuration readiness includes those customer and durable-device gates.

Remaining launch blockers include zero observed liquidity, no atomic TronZap maximum-price contract,
independent TRON genesis pinning, reviewed token safety ceilings, real-device acceptance, the scheduler
workflow on the default branch, and funded acceptance. The authorized acceptance recipient is the
operating sender itself, which the transaction preflight rejects. Do not silently substitute another
recipient, label a sweep as that withdrawal, or relax approved expense caps. No funded drill has run.
