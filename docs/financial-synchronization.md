# Financial screen synchronization

This is bounded five-second **polling**, not server push, WebSockets, SSE, a blockchain subscription,
or an immediate-finality guarantee. It updates the payments screen and the authenticated dashboard
from the private ledger endpoint. It does not increase the blockchain worker frequency (the staged
scheduler is still five minutes), enable financial gates or complete live launch readiness.

- One read in flight per mounted controller; no overlapping periodic requests. A post-command
  refresh waits for any older read, then fetches a fresh snapshot.
- Pause and abort when hidden/offline; refresh on visibility, focus and reconnection. Unmount and
  pause invalidate late results. Eight-second deadlines cover transports that ignore abort.
- Exponential failure backoff up to 60 seconds. Retain last successful data with a stale warning,
  last successful read timestamp and retry control. Session expiry clears private financial data
  and stops requests. Dashboard snapshots are also bound to the expected authenticated user ID.
- Mutating financial commands are never scheduled/retried by synchronization. Server-side balance,
  passkey approval, spending/finality/idempotency checks remain authoritative. Payment preparation
  and confirmation buttons are disabled while the snapshot is not current.
- One repeatable-read private transaction checks the durable session, balance, unresolved holds,
  outgoing command states and posted activity. Ledger-entry ownership includes incoming transfers
  and deposits, not just commands initiated by this user. No customer-supplied owner ID is accepted.
- Posted activity is NOT an unconfirmed deposit feed. Incoming network events appear only after
  trusted verification/valuation/ledger posting. The current view is bounded to 30 latest rows;
  pagination, durable notifications and server-push delivery are not claimed by this patch.

Tests cover single flight, post-command freshness, pause/abort, late-response rejection, timeout,
backoff, session termination and owner-isolated incoming ledger history with an actual SQL fixture.
Full production money/device acceptance and default-branch worker activation remain separate gates.
