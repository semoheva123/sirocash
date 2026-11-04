# Account loading and connection recovery — 2026-11-04

The reported error screenshot does not establish a session failure: the previous root error boundary used session-specific wording for every render failure. A read-only production activity aggregate showed idle app/worker connections, not active blocked transactions, at the time of inspection. It cannot establish the historical cause or justify raising pool limits.

## Changes
- Stream initial/liveness watchdog allows 45 seconds. Exponential reconnect backoff has bounded jitter; focus/wake cannot bypass a pending retry. No polling was introduced.
- Each pool observes idle-socket errors with redacted category/scope only. Session SELECT alone may retry once on an explicit dropped-connection code. TLS/auth/permission/timeouts are not retried; no monetary command is replayed.
- Concurrent same-owner financial reads share only a pending read-only transaction, after per-request authentication. Settled/rejected promises are evicted; no session or settled balance cache. PostgreSQL restricted-role checks remain in force.
- Failed account/read transaction rollbacks preserve the original failure and discard the broken client. Pool size remains one. Server statement/idle-transaction timeouts bound abandoned work.
- Streaming loading boundaries show a neutral loading state while bootstrap runs, after session verification. Root loading covers initial authentication latency. The account route error boundary keeps failure recovery localized; offline feedback disables retry until connectivity returns. User retry resets/re-fetches page reads, never repeats a transfer.
- Bootstrap parsing retains public sender/recipient names and UIDs.

## Validation and limits
Focused tests cover session retry bounds/rejections, redacted pool observation, owner-isolated in-flight reads and eviction, unauthenticated read refusal, broken rollback disposal, stream jitter/caps/watchdog/wake, and owner/session termination. Local synthetic browser tests cover Arabic/English at 320/390/1440, offline/online recovery, reset/refresh, no overflow, and GET-only requests. Navigation in that fixture uses a test adapter, not a real authenticated production session. Prior transfer-party/receipt visual regression is also retained.

No production transfer, migration, privilege expansion, infrastructure scaling, secret read, or session bypass is part of this repair. Authenticated production/device acceptance and the exact historical outage cause remain unproven. Production release status belongs in the PR/release audit, not this source document.
