# Deposit monitor repair — 2026-11-02

## Verified changes

- Changed production `SIRO_BEP20_LOG_RPC_URL` from the throttled public dRPC endpoint to `https://bsc-rpc.publicnode.com`. This is an explicit log-provider selection, not an automatic fallback. Primary receipt/finality settings and authorization isolation remain unchanged.
- Production deployment `dpl_5y5en9tE6sy4YCp8wQxif8j8YCAz` (commit `1837cc0`) reached READY / PROMOTED. Vercel confirmed aliases including `sirocash.vercel.app` and `sirocash.online`.
- Hosted read diagnostics passed BEP20 DISCOVERY and TRC20 CURSOR_RECEIPTS. These are read checks, not successful full scans or monetary acceptance.
- Renamed the legacy Prisma User relation field to `legacyDepositAddresses`; the newer `depositAddresses: UserDepositAddress[]` remains unchanged. This fixes duplicate field validation without altering database columns or requiring a database migration.
- Local Prisma generation passed with `--no-engine`; the sandbox cannot download native engines from binaries.prisma.sh. The entire `npm test` suite passed after generation. No local live database/chain tests were implied.

## Still blocked / not ready

- GitHub workflow dispatch for `financial-worker.yml` on the current branch returned HTTP 403 Resource not accessible by integration. No repeated or alternate-route dispatch attempted. GitHub connection permissions need attention before an authenticated full monitor run can be requested through Actions.
- At 2026-11-02 15:42:14 UTC the BEP20 scanner last success remained 01:33:36 UTC and TRC20 remained 2026-11-01 22:54:04 UTC. The sole TRC20 cursor remained 87633499. Both scanner timestamps were stale, despite read probes succeeding.
- Do not treat stored lag=0 or build success as healthy continuity. Existing dual-network freshness gates remain unchanged.
- No scanner timestamps/cursors were manually updated; no customer funds, signing, resource purchases or broadcasts were performed. Withdrawal activation remains unproven and disabled.

## Next acceptance step

Restore GitHub Actions dispatch permissions, run the isolated deposit monitor on this branch, inspect sanitized failure categories if it fails, and verify genuine cursor advancement and fresh scanner timestamps over successive executions. Only then evaluate the separate bounded custody/resource/liquidity and withdrawal acceptance gates.
