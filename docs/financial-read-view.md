# Authenticated read-only financial view

Balance/history availability is independent of customer-command, outbox-worker, signer and withdrawal activation. No monetary feature flag, database grant, migration or account balance is changed by this fix.

- `financialReadDatabase` uses the existing separate restricted financial credential and an independent pool. It does not use the public authentication role or enable the financial worker.
- `financialReadTransactions` starts `REPEATABLE READ READ ONLY`, validates the restricted role and read-only setting, and commits/rolls back with guaranteed release. Persistent writes are rejected by PostgreSQL.
- `readOwnerFinancialStatus` authenticates before connecting. The owner comes exclusively from the verified session. It reads the existing owner-scoped ledger projections even when `enabled` (command activation) is false, and sets `readable` only after successful reads. Command capabilities remain false while disabled.
- GET status and SSE retain authentication/no-store controls. SSE validates session expiry, subscribes before snapshot and sends commit-driven owner-only snapshots. A `readable:true, enabled:false` snapshot keeps the connection current. Legacy disabled/unreadable snapshots still close. No healthy polling was added.
- Empty ledger accounts project zero through the existing SQL. The dashboard formats an actual owner-bound zero as `0.00`; missing, invalid or mismatched-owner data remains unavailable. There is no fallback to legacy `User.balance` or a fabricated zero.
- Financial history can be viewed while execution is disabled; all preparation/approval/execution routes retain their existing gates and device/session protections. The design is unchanged apart from explanatory status text.

Verification includes isolated empty/nonempty/foreign-owner reads, read failures, actual READ ONLY write rejection, client/server SSE with disabled commands, original write-gate retention and full offline regressions. PostgreSQL 16/17 integration additionally exercises the real restricted role, empty and credited owner snapshots, cross-owner exclusion and write rejection. The production build runs `financial:read-check` to verify the read-only connection and every projection with a random synthetic owner, without modifying or logging customer data.
