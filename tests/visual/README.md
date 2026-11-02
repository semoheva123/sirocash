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
