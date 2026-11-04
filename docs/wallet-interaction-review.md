# Wallet interaction and transaction record review

## Scope and boundaries

Requested: moving price strip, visible-by-default balance, responsive feedback and truthful deposit/withdrawal records. No production transfers, broadcasts, flag changes, provider purchases, new vendor or secrets are part of this work. The user explicitly approved a limited additive migration to store the verified sender of new deposits; no historical backfill was approved. Financial notifications remain push/SSE; no wallet polling was added. Existing auth, device approval, capability, server idempotency, pricing and custody gates remain mandatory.

## Changes

- The actual mobile wallet had `hidden=true` on mount. It now starts visible, with an accurately labelled eye control to hide/show. No local-storage financial snapshot or synthetic balance is introduced. Exact available balance and owner isolation are retained.
- The independent public-file ticker now uses its existing duplicated track with a 40-second transform-only CSS animation. No React frame loop, extra data requests, dialogs or controls. Hidden-document events pause motion; keyboard focus pauses it for reading. Reduced-motion users get a static horizontally scrollable single copy. Existing bounded credentialless reader, expiry, CSP exact-path allowlist and legacy-feed isolation are unchanged.
- Financial requests have synchronous locks (not just asynchronously disabled buttons), busy feedback, persistent inline result/error notices and a 20-second browser wait bound. Aborting a browser wait is NOT proof of cancellation on the server. An attempted financial command keeps its exact request/quote identity after an unknown result; it cannot be edited into a replacement. Completed commands cannot be submitted again from the same review.
- Quote preparation explicitly says it is NOT payment completion. Internal-transfer success still requires the existing committed receipt. Withdrawal feedback validates operation ID, known operation state and the matching quote ID, rather than trusting HTTP 200 alone. Accepted/processing, failed and completed results are distinct. A later stream-refresh failure does not erase the recorded result or encourage a duplicate command.
- Read-only owner-scoped financial projections include deposit recipient, signed withdrawal sender/recipient/token amount and quote network/recipient/gross/net/fee. No signed payloads, credentials or broad `SELECT *` are exposed. Incoming sender is taken from the verified token Transfer event, not the transaction initiator. Existing role grants suffice; actual restricted-role schema regression passes. One explicitly approved nullable sender column and immutable-field trigger are added for incoming sender evidence. The quote join uses existing unique operation ID and owner binding. Record limits remain 30 and no additional snapshot queries are added.
- Deposit and withdrawal tabs show full copyable persisted addresses, exact token amounts, currency/network, date including year, chain hash where available and canonical mainnet explorer links (strict hash validation; no arbitrary response URLs). Withdrawal fee is the stored token withdrawal fee, not a guessed gas fee; USD debit remains separately labelled. Chain confirmation and account operation state remain distinct. Activity details link to the corresponding dedicated history page.
- Notification read actions and logout gain synchronous duplicate-click guards. Mark-read success, session termination success and refresh-after-success failures are explicit. Deposit notification links now open `/deposit` rather than an obsolete wallet anchor.
- Scoped press/hover/focus transitions, short feedback entry transitions and pending icons add responsiveness without animations on financial amounts. Reduced motion is honored.

## Reviewed action matrix

| Surface | Existing/retained feedback and safeguards | Changes / result |
|---|---|---|
| Email sign-in/signup and code verification | Loading indicator, form errors, resend cooldown, synchronous lock, navigation only after verified server result | Retained; no claim that email-provider acceptance proves inbox delivery |
| Account recovery | Pending/error, code stage, confirmed password-reset success; request lock | Retained; anti-enumeration message preserved |
| Password and email changes | Current password + required code(s), disabled busy state, errors, confirmed-result sign-out | Retained; no premature success |
| Logout and sessions | Server-confirmed termination/sign-out, confirmation for revocation, errors | Logout synchronous lock; explicit session success |
| Language, balance visibility, navigation/filtering | Immediate local selection state / labelled eye / selected navigation or filters | Default balance visible; light accessible press/focus feedback. No fake server-success toast for local-only choices |
| UID receive/copy/share | Owner-bound UID, loading/retry, clipboard/share outcome and cancellation handling | Retained; no invented identity or KYC |
| Deposit address | Checking/loading/verified address, wrong-network/demo rejection, retry/error/copy feedback, stale-owner/network request exclusion | Retained; read-only history enriched |
| Transfer | Amount/UID validation, recipient review, exact sender fee, device authorization, committed recipient-credit receipt | Synchronous request lock, clearer busy/review/error/unknown-result feedback; no replacement after uncertainty |
| Withdrawal | Quote fee/net/debit review, device approval, independent capability gates, submitted versus settled states | Matching committed-result validation and pending/failure/completion feedback; richer dedicated history |
| Financial stream/retry | Current/retrying/offline/session-ended, owner replacement protection, one shared SSE stream | Retained; no polling |
| Notification read | Pending/disabled, server write, push refresh, error | Synchronous lock and explicit acknowledged read versus failed list refresh |
| Support create/reply/close | Draft retention, request lock and idempotency key, pending/error/sent, persisted closed status | Retained; no fabricated delivery |
| Identity intake/review | Loading/error/status, request lock, pending review not verified identity | Disabled deployment gates unchanged; no activation |
| Exchange, USDC, external delivery, unavailable services | Explicit unavailable/coming-soon, disabled submission | Remain disabled; animation is not activation |

## Approved new-deposit sender storage and historical limitation

Previously `ChainDepositInbox` did not persist the token Transfer-event sender. The user explicitly approved saving it for new deposits. Migration `20261104210000_deposit_sender` adds nullable `sender`, a network-format check (NOT VALID avoids scanning old rows, new writes are checked), and an immutable-field trigger. It introduces no role grants, wallet mutations, provider calls or default backfill. Transaction-local lock/statement bounds make deployment fail rather than wait indefinitely behind financial work.

Both existing verified TRC20/BEP20 ingestion paths persist their normalized `event.from` in the same insert as the already fingerprint-bound verified evidence. Replays keep old rows unchanged, reject conflicting non-null senders and do not create another deposit. The mutation guard blocks changing/clearing a saved sender. An old null sender stays null; no backfill is silently performed. Owner-scoped SSE includes it for the same beneficiary only.

Historical records without a saved sender still show unavailable with a valid explorer link. A transaction hash, top-level transaction initiator, token contract, current operating wallet or customer UID cannot safely substitute for token-event sender evidence. Unsigned withdrawals likewise cannot have an actual broadcast sender or TxID invented before signing. No per-history RPC reads or automatic historical scans were added.

## Verification

- `npm run test:tron-deposits` / `npm run test:bep20-deposits`: persisted exact verified sender, immutable-field rejection, idempotent replay/conflicts and no credit or network call.
- `npm run lint`
- `npm run test:deposit-ui` includes new `tests/wallet-feedback.tsx`: bilingual scoped histories, decimals, genuine stored addresses/fees, chain/account state separation, missing sender/hash, malicious explorer input rejection, clipboard success/failure, synchronous double-prepare lock, retained retry key, quote preparation not payment success.
- `npm run test:financial-stream`, `npm run test:financial-sync`, `npm run test:support`: restricted read role/full schema, owner isolation, signed-payload exclusion, pushed updates, existing financial capability and idempotency contracts.
- `npm run test:csp-browser`: actual component/CSS at 390/1280px, RTL/LTR, changing computed transform, no page overflow, reduced-motion scrollable fallback; original production-CSP negative/positive controls retained. All data is synthetic and no live source, authenticated production session or financial network operation is used.
- Full `npm test` and CI/build gates must pass before release. Build/CI success does not prove the historical real-device freezing issue solved; authenticated production-device acceptance is separate.

## Repair follow-up — 2026-11-05

Implemented in the account UI (not a financial activation):

- Authenticated, owner-scoped read-only keyset history, 30 rows per explicit page; independent withdrawal snapshot and deposit/withdrawal history. Exact operation resolver also permits the legitimate transfer counterparty only.
- Explicit global reference/name/UID/address/hash, date (UTC), kind and network search; parameterized literal substring matches. Filtered history never overwrites account balance or capabilities.
- Pending requests plus uncredited chain observations, exact USDT base-unit conversion, deduplication and known-completed exclusion. Pending pages invalidate on pushed snapshot changes, not a polling timer. Loading older pages is explicit.
- Exact transaction deep links from notifications; exact detail hides global search/pagination. Support can prefill the real reference. Notification operation IDs are resolved instead of mistaken for transaction IDs.
- Settings mount network-backed identity/profile/session panels only when selected. Browser network calls have a 20-second header/body deadline, cancellation and no automatic replay, including timed-out writes whose outcome may be unknown.
- Completed transfer receipt sharing/clipboard fallback, truthful cancellation/errors, reset copy feedback on changed values. Financial requests page starts at pending history instead of duplicating execution forms; home no longer repeats the full wallet service grid.

Verified locally: complete `npm test` and production `npm run build` passed; restricted-role full-migration fixture covers tied-date pagination, 35 withdrawals behind 40 newer transfers, owner isolation, pending pagination, literal search and date filters. Client fixtures cover single-attempt deadlines including a stuck body, pre-abort, 204, lazy settings, copy reset and late old-owner responses. Further follow-up edits are rerun before release.

Limits: no real-device freeze acceptance has been demonstrated. No real financial operation, provider request, migration, historical sender backfill, price-source activation change, custody/resource gate change or deferred-service activation was performed. Hardware passkey management, KYC, exchange, ShamCash and mobile top-up remain unavailable where operationally disabled; no fake completion or verification is supplied. Independent price workflow scheduling freshness remains unproved by these tests.
