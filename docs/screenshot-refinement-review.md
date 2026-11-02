# Screenshot-led wallet refinement — 2026-11-03

This is a second revision after PR #9, based on the nine user-provided screenshots
IMG_4430–IMG_4438. It changes the existing authenticated application, not a separate
prototype. This work has not been published by this task.

## Reference coverage

- Wallet/home: one balance card with deposit/withdraw actions, compact recent
  transactions, service cards and four navigation destinations plus a send trigger.
- History: all/incoming/outgoing/pending filters, expandable reference/type search,
  signed transaction cards, exact amounts and a read-only detail sheet.
- Send chooser: internal account transfer versus external remittance in a dismissible
  bottom sheet. Existing send page remains directly accessible.
- External methods/form: method sheet and amount/delivery grouping. All external
  rails remain explicitly unavailable. No exchange rates, minimum amounts, fees,
  delivery promises, recipient collection or executable remittance are introduced.
- Internal send: existing amount → recipient → server-quote review preserved,
  including sender-added 1% fee, device approval and unknown-outcome protections.
- Services: responsive grid linking existing deposit, withdrawal, Sham Cash and
  mobile top-up routes; no new service execution capabilities.
- Account: account, security/privacy and help groups, privacy link and existing
  logout action; no fabricated Google Authenticator or identity-verification status.

The reference's personal data, branding, financial quotes and unsupported features
are not copied. Siro Cash retains its solid black/charcoal identity and AR/EN layout.

## Data and safety boundaries

Incoming/outgoing is derived from the signed owner-bound activity amount, not from
transaction type (a P2P transfer can be either direction). String-only formatting
preserves up to six decimals, including tiny nonzero values, without floating-point
rounding. The home balance continues to use the existing exact available-balance
calculation. Owner isolation, the shared SSE connection, backend accounting,
withdrawal fees, resource providers and execution gates are unchanged.

## Validation

- `npm test`: PASS after final component/test updates.
- Production compilation: `next build --webpack`: PASS.
- `git diff --check`: PASS.
- Chromium: 72 fixture renders at 360/390/768/1440 px in Arabic and English.
  No document-level horizontal overflow or browser runtime errors.
- Interactive checks: signed filters, search, transaction detail references,
  send-sheet dismissal/focus return, visible services, settings drill-down/back,
  amount → recipient → server review and disabled external delivery methods without
  any prepare/transfer/withdraw request.
- Inspected actual captured home, history, account and sheet images. Screenshot
  animations are disabled for stable captures rather than capturing fade-in frames.

Browser tests use only synthetic owner-bound fixtures, visibly labelled TEST DATA
ONLY. They are not authenticated production/device acceptance and do not move funds.
Prisma engine downloads are blocked in this sandbox; compilation used an engine-free
local generated client. No database integration or deployment readiness is inferred
from that build. Full deployment/provider probes were not run as part of UI review.
See `tests/visual/README.md` for browser reproduction. Generated images, browser
binaries and fixture bundles remain ignored under `.cache/`.
