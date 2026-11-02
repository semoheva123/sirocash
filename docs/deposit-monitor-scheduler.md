# Deposit monitor scheduler (2026-11-02)

## Failure and fix

GitHub cron start times were irregular enough for the existing 10-minute scanner
freshness gate to expire. A successful manual catch-up therefore did not establish
ongoing deposit availability. Do not change the freshness/lag gate or reset cursors.

The primary trigger is now Supabase `pg_cron` -> asynchronous `pg_net` -> the fixed
Vercel `/api/internal/deposit-monitor-scheduled` endpoint every two minutes. This
uses the existing database and deployment, not another hosting service. It is still
subject to Supabase/Vercel/RPC availability and quotas, not an uptime guarantee.

## Security and bounds

- Install the Prisma ticket migration before `ops/supabase-deposit-monitor.sql`.
  Installation defaults to **disabled**. Enable only after the route is deployed.
- Each enqueue generates 256 random bits inside PostgreSQL. Only SHA-256 is stored
  in the private ticket table; the bearer travels only in pg_net's private request
  queue over HTTPS. No long-lived production secret is exported or decrypted.
- Tokens expire after two minutes and are consumed atomically in a committed
  transaction before work. A timeout does not authorize a replay of the same token.
- App/anonymous/authenticated roles cannot read tickets, enqueue work, consume
  tickets, or read the network queue. The restricted financial worker can only
  execute the ticket-consumption bridge, not mint capabilities or enable scheduling.
- The route rejects malformed credentials, nonproduction mode, and every external
  execution flag before opening the database. Valid-format unknown tokens require
  one indexed private authorization lookup; no public RPC execution privilege exists.
- It composes **only** the isolated deposit scanner/valuation worker, never the
  general signing/purchase/payout worker. If deposit-only mode is removed, this
  trigger fails closed; full-finance scheduling needs a separate reviewed transition.
- At most one enqueue per 115 seconds; active scanner leases skip redundant ticks.
  Existing network leases and idempotent deposit credits protect overlap with a
  manual/GitHub backup. HTTP timeout175s, existing route180s/worker110s budget retained.
- No transport retries; the next periodic tick gets a new capability. Tickets are
  pruned after one day, this job's cron history after seven days. pg_net response
  retention remains extension-managed. No raw provider errors/tokens are logged.

## Activation / rollback

Administrator-only SQL after successful deployment:

```sql
UPDATE public."DepositMonitorSchedule" SET enabled=true WHERE id=1;
```

Rollback without modifying custody or scanner cursors:

```sql
UPDATE public."DepositMonitorSchedule" SET enabled=false WHERE id=1;
```

This revokes even outstanding unconsumed tickets. Cron may remain registered while
it performs a no-op. Use `cron.unschedule('sirocash-deposit-monitor')` to remove it.
GitHub remains a bounded manual/occasional backup, not the liveness dependency.

## Acceptance evidence

`cron.job_run_details.status='succeeded'` proves only that the enqueue SQL ran.
`usedAt` proves only that the endpoint authenticated. Require pg_net HTTP200 with
COMPLETED results, then actual scanner timestamps and lag within the unchanged
limits, across several automatic two-minute cycles. Do not describe this as funded
deposit/withdrawal acceptance. Inspect live API usage against the account's actual
quota, and Vercel/DB resource consumption, after catch-up and steady state.

Tests: `tests/scheduled-deposit-monitor.ts` covers hosted-style default grants,
private tables, disabled scheduling, expiry/replay and isolation gates with fixtures;
`npm test` also runs the existing scanner, receipt, ledger and worker tests.
