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

## Catch-up repair

Read-only database inspection at 16:19:13 UTC confirmed the actual blocker: TRC20 had progressed to block 87633566 but was 20636 blocks behind its recorded finalized head. BEP20 lag was zero. No cursor was moved manually.

The scanner now supports bounded TRON ranges (production: 16 blocks; hard maximum: 32). Complete receipts are checked for every block, parent links are checked across the entire range, and at most four block/receipt pairs are processed concurrently. A missing middle-block receipt prevents the entire range checkpoint from committing. Candidate receipt verification, partial event replay, cursor locks, reorg pauses, and ledger idempotency remain enforced.

Manual Actions runs can select 1, 8, or 32 sequential monitor batches (default 32). Continuation requires a known COMPLETED response, zero held work, valid counters, no failed/busy/paused/unknown network state, and actual PROGRESSED state. HTTP errors or unknown transport outcomes stop immediately without retry. The job remains failed if the bounded catch-up limit ends before health is established. This is watch-only scanning, not withdrawal/resource execution. Initial catch-up may consume significant Actions runtime and chain read quota; successful local tests do not establish live throughput or sustained scanner health.

## Bounded solidified block range reads

The official java-tron `SolidityNodeHttpApiService` registers `/walletsolidity/getblockbylimitnext`; its `GetBlockByLimitNextServlet` accepts startNum inclusive and endNum exclusive. Production scanning now requests two solidified blocks per range (local hard maximum four), keeps receipt reads serialized, and retains the existing 8 MiB response limit. It checks exact range length, every height/hash, the initially fetched anchor, all parent links and all receipt sets before committing. End-anchor and candidate canonical receipt rechecks remain independent fresh reads. No alternative provider or latest/unconfirmed endpoint is used.

Hosted build preflight now compares a two-block range against individual canonical block reads at the actual cursor, and refuses deployment on mismatch or unsupported service. Offline tests verify incomplete ranges and missing middle-block receipts cannot move cursors; all local tests passed. This reduces block-fetch request count, but is not evidence of successful sustained hosted catch-up until measured after deployment.

Monitor responses and Actions now expose allowlisted per-network blocks, elapsedMs and lagBlocks. These report actual scan progress rather than equating a COMPLETED batch with customer readiness.
