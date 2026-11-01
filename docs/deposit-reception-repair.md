# Deposit reception repair — 2026-11-01

Scope: USDT receipts on TRC20/BEP20; funds stay in customer HD subaddresses. No signing, sweeping, withdrawal, internal debit, gas funding or resource purchase has been enabled.

## Implemented

- One network scan for all assigned addresses rather than replaying the chain separately per customer.
- BEP20 uses fixed-USDT filtered ranges up to 1000 blocks with OR groups of at most 64 assigned recipients. The RPC adapter still rejects arbitrary contracts, unbounded ranges and write methods.
- TRON uses solidified blocks and one complete block-receipt batch, requiring an exact receipt/transaction-ID set; it no longer fetches only three receipts per address per cycle. Only candidate deposits enter the existing independent receipt/inclusion verifier.
- Bounded candidate pages (default 32), persisted per-address log offsets, atomic inbox/checkpoint updates, new-address historical backfill and restart-safe exact event deduplication. No cursor advances on incomplete receipts or checkpoint failure.
- Exclusive per-network leases and canonical hash anchors. A conflicting canonical anchor/evidence pauses the entire affected network and all its address cursors; valuation refuses paused addresses.
- Public reception checks both network scanners' freshness/backlog. New address generation rechecks network health under a DB lock and enforces a 2048-address/network capacity bound. A stale or paused scanner cannot be represented as healthy reception. Wallet QR rendering also respects an explicitly disabled deposit capability.
- Scan budget is shared across networks (<=85 seconds), followed by a separate valuation queue (up to 128 jobs within 25 seconds; no more than ten-second reuse of a real observed USD price); saved payouts/sweeps/gas/resource jobs are excluded. Customer-deposit flags can remain off while warming up the watch-only worker.
- Scheduler uses an off-peak five-minute GitHub schedule, constant-time authenticated server endpoint and a failure result if the watcher is unhealthy/holding work. Workflow publication on the default branch and a verified GitHub secret are operational requirements, not implied by a source file.

## Database

Applied migration `20261101030000_deposit_network_scanner` to the SiroCash project: new isolated `DepositNetworkScanner` table, TRC20/BEP20 lease rows and progress index. App/anon/authenticated roles have no access; restricted financial worker can SELECT/UPDATE only. The checked financial schema now contains 29 tables. Prisma file SHA-256 `9644888961c97c34e9439f488e5c9fa98454643825e771c8c054e55d5aa67e9b` is recorded with the migration. No customer addresses, balances or monetary operations were created by this migration.

## Evidence and launch boundary

The isolated scanner integration test covers a 1000-block catch-up with 67 recipients, a dense TRON block with 1002 receipts, OR grouping, partial pages, transaction rollback, replay, a newly assigned address behind the global checkpoint, owner-bound USD valuation exactly once, balanced journals and network-wide reorg pause. Full offline tests must pass before release. These are not funded mainnet acceptance tests.

An opt-in deployment probe checks the configured endpoints plus named public diagnostic candidates for actual chain56/finalized/range1000/OR `eth_getLogs` support, and checks the TRON bulk receipt set against a solidified block. Candidates do not silently reconfigure production or become fallback providers. Only a tested endpoint may subsequently be selected by operator configuration.

Public customer reception remains disabled until default-branch scheduling, authenticated worker execution, healthy lag and bounded real deposit/credit acceptance are established. A successful build alone is not an activation certificate.
