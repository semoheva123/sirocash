# Scoped deposit/withdrawal record layout fix

Reported from a real phone screenshot: a long BEP20 transaction ID escaped its
card, with inconsistent history heading and metadata layout.

## Cause and change

The scoped FinancialRecords component is returned outside `.financial-history`.
Existing transaction-reference code constraints only targeted that parent. The
previous visual fixture also had no deposits, so it reviewed the empty state.

- Apply explicit sizing, spacing, typography, state/network/date hierarchy and
  min-width constraints to `.financial-records` and its cards.
- Opt-in compact reference presentation (first ten / last eight characters).
  Full exact value remains the copy source and title; a native details disclosure
  exposes the selectable full value, safely wrapped even at 320 px.
- Give copy controls a 44 px hit target and keep success/error feedback inside the
  card, without overlaying adjacent records.
- Default FinancialReference presentation elsewhere remains unchanged.
- Add synthetic long-reference deposits/payouts to the existing browser fixture.

No accounting, real records, state transitions, network configuration, approvals
or financial execution paths changed.

## Verification

- Full `npm test`: PASS, including compact/default reference regressions and exact
  deposit amount/network-unit conversion.
- `next build --webpack`: PASS (local engine-free generated Prisma client, not a
  database integration or deployment-readiness test).
- Scoped records Chromium review: 28 renders, seven widths (320, 360, 375, 390,
  430, 768, 1440), Arabic/English, deposit/withdrawal. Confirmed no document/card
  overflow with details collapsed and expanded; exact full clipboard copy;
  clipboard failure/manual fallback; visible amount/state/network/date.
- Existing 72-render interactive browser regression: PASS with populated records.
- `git diff --check`: PASS.

Browser evidence uses explicitly labelled synthetic local fixtures, not an
authenticated production account or real funds. This correction is not deployed
by this task. Reproduction: tests/visual/README.md.
