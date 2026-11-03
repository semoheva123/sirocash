# Local browser review (not a production route)

This harness renders the real React components and the real application CSS with
synthetic owner-bound SSE snapshots. Only Next Link is replaced by a normal anchor.
It does not bypass production authentication or read production data. Every fixture
page is visibly labelled TEST DATA ONLY. Financial execution is always rejected.

Optional tools (not needed for the normal offline suite):

```
npm install --no-save --package-lock=false playwright@1.64.1 @sparticuz/chromium@153.0.0 esbuild@0.28.2
node tests/visual/serve.mjs
# in a second terminal
node tests/visual/review.mjs
```

On Linux systems without NSS libraries, install the browser's system dependencies
or extract `@sparticuz/chromium/bin/al2023.tar.br` into an ignored local directory
using Node's `brotliDecompressSync` and `tar`. Add its `lib/` to `LD_LIBRARY_PATH`.
No library archive or browser binary belongs in Git.

The review script checks 360/390/768/1440 px, Arabic and English, and eight base views plus external remittance (72 renders).
It verifies no document-level horizontal overflow or browser runtime exceptions,
settings drill-down/back, signed incoming/outgoing/pending filters, search and details,
send-sheet Escape/focus restoration, visible service cards, blocked external delivery
methods without financial requests, and amount → recipient → server-quote review. It never
clicks device approval. PNGs and bundles go to `.cache/visual-wallet/` (ignored).
These are fixture screenshots, not proof of an authenticated production-device test.

## Long-reference scoped history regression

`node tests/visual/records-review.mjs` checks 28 deposit/withdrawal renders at
320/360/375/390/430/768/1440 px in both languages. Fixtures include 64/66-character
TRON/BSC transaction references, large exact amounts and real status/date shapes.
Checks cover card/document overflow before and after expanding the full reference,
exact full-value clipboard copy and copy-failure/manual fallback. No real addresses
or transactions are read. Use the same local fixture server and browser library
setup above.

## Receiving UID and recipient review

`node tests/visual/uid-review.mjs` checks wallet/profile UID rendering, exact copy,
QR display, immutable usernames, owner-bound profile updates and wrong-owner
response rejection at 320/360/390/768/1440 px in AR/EN. The base review also enters
an Arabic-digit UID and checks the resolved recipient card before device approval.
These are synthetic data only; the fixture never executes a financial command.

## In-app support center

`node tests/visual/support-review.mjs` checks six complete AR/EN flows at
320/390/1440 px: customer request, committed-but-lost response/retry with the same
idempotency key, customer follow-up, staff reply, closure, escaped hostile text
and overflow. Browser API responses are synthetic; no production users/emails or
financial commands are involved. Screenshots include the compose and thread views.

## Reference exchange ticker

The shared synthetic account fixture includes the top exchange ticker. Run
`node tests/visual/exchange-review.mjs` against `node tests/visual/serve.mjs`.
It intercepts the authenticated feed with synthetic new-SYP data and checks 24
AR/EN states at 320/390/1440px: reference/stale/expired/unavailable, no document
overflow, source disclosure and a single feed request. No provider or production
calls. Optional `playwright` / `@sparticuz/chromium` packages are no-save tools.
On minimal Linux, extracted Chromium al2023 libraries may require
`LD_LIBRARY_PATH="$PWD/.cache/chromium-libs/lib"`.
