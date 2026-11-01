# Financial synchronization: database events → SSE (no polling)

The previous five-second polling implementation has been removed. The browser opens
`/api/financial/events` with same-origin HttpOnly session cookies; no database key, private key,
financial credential or cross-customer channel is exposed to it.

## Delivery

1. Migration `20261101000000_financial_change_notifications` adds PostgreSQL triggers for user
   ledger balances, wallet operations, transaction status and session revocation/expiry edits.
2. `NOTIFY` contains **only an owner UUID**. PostgreSQL delivers after COMMIT and suppresses
   rolled-back changes. Even spoofed notifications cannot supply financial data or execute commands.
3. One dedicated, restricted financial-worker **session-mode** `LISTEN` connection per active
   server instance multiplexes invalidations to authenticated owner subscriptions. Transaction
   pooling is not used for LISTEN. Supabase pooler port 6543 is converted to its session port 5432;
   other session endpoints may use server-only `FINANCIAL_EVENTS_DATABASE_URL`.
4. Subscribe before the initial coherent, authenticated repeatable-read snapshot. Drain dirty
   invalidations while reading, so commits during initial reads/reconnects are not lost. Subsequent
   snapshots are read **only on events**, explicit manual/post-command refresh or reconnection.
5. Browser receives SSE snapshots over the open HTTP response. Incoming and outgoing posted
   ledger activity appears without page reloads. Intermediate state changes can be coalesced;
   the stream is latest-state reconciliation, not an immutable notification/event replay log.

Migration `20261101010000_financial_event_function_isolation` also revokes direct function
permissions granted by hosted default privileges; production preflight checks this isolation.

## Safety and lifecycle

- No GET interval, background balance polling, WebSocket provider or extra hosting service.
- Fifteen-second heartbeats contain no financial data and make **no database reads**. The browser
  uses a silence timeout to detect dead connections. Reconnection backoff is transport recovery,
  not periodic financial polling. Old stream callbacks cannot update a newer session.
- SSE closes/reconnects before Vercel's 300-second function deadline (270-second transport rotation).
  A reconnect snapshot reconciles missed changes. This is required by serverless hosting, not a
  five-second refresh substitute. Hidden/offline tabs close; visible/online tabs reconnect.
- Initial and pushed snapshots validate the session using the existing private status reader.
  Session deletion/change triggers revalidation; an expiry timer closes expired sessions even
  without new financial events. The browser clears private data on terminal expiry/owner mismatch.
- Disconnect, backpressure, listener failure and abort close the stream and release subscriptions.
  A last-success timestamp remains visible on failure; commands are not retried by streaming.
- Disabled financial services produce one disabled response and stop: no silent polling fallback.
- No paid execution, signer, deposit-discovery, withdrawal or scheduler gate is enabled by this work.

## Verification and limits

- Unit/ReadableStream tests: trusted-owner subscriptions, framing, initial/pushed snapshots,
  heartbeat without reads, stale-event exclusion, reconnect, session termination and cleanup.
- Real PostgreSQL 16/17 fixture: separate LISTEN session, actual trigger delivery after commit,
  no pre-commit or rollback notifications; existing concurrency/restore tests still run.
- Production build preflight: verified restricted session connection and all four triggers, then
  a separate connection sends a synthetic random-owner invalidation. No customer/ledger rows,
  balance mutations, transactions on either chain or provider purchases are made by this probe.
- Broadcasting ledger changes does **not** make blockchain discovery/finality instantaneous.
  The existing worker schedule is unchanged. Latest history remains bounded to 30 rows.
- Production browser/device acceptance and load/capacity testing are separate from SQL/transport
  tests. Connection/memory/function usage must be capacity-planned; unlimited free scale is not promised.

## Account-wide financial UI

The authenticated account layout owns one shared SSE subscription across dashboard, deposits,
withdrawals, payments, Sham Cash and mobile top-up routes. Consumers reuse the provider rather
than creating a connection for each card. Balances on member routes no longer fall back to
legacy `User.balance`; the authenticated dashboard no longer renders the legacy/demo history.

The common live feed includes ledger movements of every persisted transaction type, wallet
command states, assigned deposit addresses, observed deposit/valuation states and signed payout
network-delivery states. Migration `20261101020000_financial_network_events` adds three owner-only
invalidation triggers for address assignment, deposit inbox and payout outbox changes. Preflight
now checks seven triggers and isolation of both trigger functions. Private signed bytes, keys,
vault metadata and other users' records are never projected into snapshots.

Pending/observed deposits are not labelled as credited; signed/unknown payouts are not labelled
as confirmed. Each list shows the latest 30 records, not an unlimited/paginated history. Services
without a live execution backend remain explicitly disabled; broadcasting their future ledger
records does not activate those services. Member deposit/withdrawal pages route commands to the
secure payments screen rather than displaying disabled demo forms as live functionality.
