# Wallet interaction and transaction record review

## Scope and boundaries

Requested: moving price strip, visible-by-default balance, responsive feedback and truthful deposit/withdrawal records. No production transfers, broadcasts, migrations, flag changes, provider purchases, new vendor or secrets are part of this work. Financial notifications remain push/SSE; no wallet polling was added. Existing auth, device approval, capability, server idempotency, pricing and custody gates remain mandatory.

## Changes

- The actual mobile wallet had `hidden=true` on mount. It now starts visible, with an accurately labelled eye control to hide/show. No local-storage financial snapshot or synthetic balance is introduced. Exact available balance and owner isolation are retained.
- The independent public-file ticker now uses its existing duplicated track with a 40-second transform-only CSS animation. No React frame loop, extra data requests, dialogs or controls. Hidden-document events pause motion; keyboard focus pauses it for reading. Reduced-motion users get a static horizontally scrollable single copy. Existing bounded credentialless reader, expiry, CSP exact-path allowlist and legacy-feed isolation are unchanged.
- Financial requests have synchronous locks (not just asynchronously disabled buttons), busy feedback, persistent inline result/error notices and a 20-second browser wait bound. Aborting a browser wait is NOT proof of cancellation on the server. An attempted financial command keeps its exact request/quote identity after an unknown result; it cannot be edited into a replacement. Completed commands cannot be submitted again from the same review.
- Quote preparation explicitly says it is NOT payment completion. Internal-transfer success still requires the existing committed receipt. Withdrawal feedback validates operation ID, known operation state and the matching quote ID, rather than trusting HTTP 200 alone. Accepted/processing, failed and completed results are distinct. A later stream-refresh failure does not erase the recorded result or encourage a duplicate command.
- Read-only owner-scoped financial projections include deposit recipient, signed withdrawal sender/recipient/token amount and quote network/recipient/gross/net/fee. No signed payloads, credentials or broad `SELECT *` are exposed. Existing schema and role grants suffice; actual restricted-role schema regression passes. The quote join uses existing unique operation ID and owner binding. Record limits remain 30 and no additional snapshot queries are added.
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

## Known data limitation — not silently represented as complete

`ChainDepositInbox` does **not persist the token Transfer-event sender**. A transaction hash, top-level transaction initiator, token contract, current operating wallet or customer UID cannot safely substitute for it. This release displays the missing sender as unavailable and links to the correct explorer when the hash is valid. It does not perform per-history RPC calls or write/backfill old financial rows.

Full incoming-sender coverage therefore remains unfinished and requires a separately approved storage/ingestion change using already verified Transfer-event `from` evidence, plus a bounded reviewed strategy for historical data. The current work does not claim both addresses are available for every historical record. Unsigned withdrawals likewise cannot have an actual broadcast sender or TxID invented before signing.

## Verification

- `npm run lint`
- `npm run test:deposit-ui` includes new `tests/wallet-feedback.tsx`: bilingual scoped histories, decimals, genuine stored addresses/fees, chain/account state separation, missing sender/hash, malicious explorer input rejection, clipboard success/failure, synchronous double-prepare lock, retained retry key, quote preparation not payment success.
- `npm run test:financial-stream`, `npm run test:financial-sync`, `npm run test:support`: restricted read role/full schema, owner isolation, signed-payload exclusion, pushed updates, existing financial capability and idempotency contracts.
- `npm run test:csp-browser`: actual component/CSS at 390/1280px, RTL/LTR, changing computed transform, no page overflow, reduced-motion scrollable fallback; original production-CSP negative/positive controls retained. All data is synthetic and no live source, authenticated production session or financial network operation is used.
- Full `npm test` and CI/build gates must pass before release. Build/CI success does not prove the historical real-device freezing issue solved; authenticated production-device acceptance is separate.
