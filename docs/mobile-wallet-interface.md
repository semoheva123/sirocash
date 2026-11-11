# Siro Cash mobile wallet interface

Implemented against the written workflow, integrated with the existing authenticated
application. This is not a claim of independently audited Yamersal feature parity.

## Routes

- `/dashboard`: greeting/profile/security notifications link, hidden-by-default USD
  spendable total, show/hide control, USDT/USDC indicators, Send → Receive → Deposit
  → Exchange, and the signed-in owner's recent transactions.
- `/wallet`: the same private balance and actions, with links to withdrawal, deposit,
  Sham Cash and mobile top-up.
- `/activity`: real owner-bound financial activity, search and type filtering.
- `/send`: delivery-method selector; internal transfers use the existing preparation,
  device authorization, idempotent command submission and uncertain-outcome handling.
- `/deposit`: existing verified owner-bound address/QR/copy flow and deposit-only
  records. USDT TRC20/BEP20 remain the only enabled crypto combinations.
- `/exchange`: explicit coming-soon state, no synthetic quotes or execution.
- `/settings`: clean menu anchors to identity, language, password/email OTP,
  active sessions/security events, and support. Existing server-backed controls remain.

Mobile navigation has exactly four entries: Home, Wallet, Activity, Settings. Action
routes select Wallet. Routes remain protected by the account layout and share one SSE
subscription. No polling was added.

## Modules

- `components/mobile-wallet.tsx`: home, wallet, activity and exchange presentations.
- `components/account-navigation.tsx`: shared desktop and four-tab mobile navigation.
- `components/delivery-methods.tsx`: unavailable delivery rails and recipient field layout.
- `components/customer-payments.tsx`: existing live transfer/withdrawal flow and gates.
- `components/transfer-fee-preview.tsx`, `lib/transfer-preview.ts`: exact-decimal,
  display-only sender-added 1% preview, tested against server quote results.
- `components/deposit-panel.tsx`: actual address flow, unsupported asset/network
  selectors and local funding partner link.
- `app/mobile-wallet.css`: scoped charcoal/white presentation overrides, RTL/LTR,
  touch targets, focus states, safe-area bottom navigation and reduced motion.

## Unchanged financial boundaries

Cash hand-delivery, Al Haram/Al Fouad rails, currency exchange, USDC and Ethereum
remain unavailable. Disabled delivery fields do not collect or submit personal data.
Sham Cash links to its existing availability-gated route; no partner API was invented.
No new fee, exchange rate, KYC activation, provider purchase or money movement was added.
Balances use posted minus active holds through exact integer arithmetic; there is no
separate held-balance display. Address readiness and session/network isolation remain.

## Verification

`npm run test:deposit-ui` includes mocked DOM tests for address safety, withdrawal
gates and the new wallet (privacy, routing, owner isolation, reservation/release/settlement,
unsupported rails, exact fee parity and no money requests). Existing settings, security,
SSE and financial suites remain applicable. `npx next build --webpack` verifies the
Next.js build only, not production deployment/readiness or visual acceptance on devices.

Latest local validation: full `npm test` PASS; Next.js webpack production compilation
PASS. No live financial action, production configuration change or deployment was
performed as part of this interface work. Browser/device visual acceptance remains
separate from mocked DOM tests and compilation.

## Settings drill-down correction (2026-11-12)

Owner report: tapping a settings row left the screen wherever the long menu had been scrolled, and
two screens opened with other content above the tapped item. Fixes in `components/account-settings.tsx`
and `app/mobile-wallet.css`: every view change (row tap and back) scrolls to the top and moves focus to
the opened screen; "Change password" now opens with the password form first (sign-in facts follow);
"Sessions & security activity" opens with the sessions panels first (sign-out card follows); every
menu row carries a direction-aware chevron and a pressed state; a 180 ms enter transition is disabled
under reduced motion. No settings capability, endpoint or copy about availability changed.
Test: `tests/account-settings.tsx` (drill-down contract).

### Correction after the owner's screenshot (2026-11-12, same day)

The screenshot showed the opened "Sessions & activity" title with the whole settings menu still
under it. Cause: the themed menu rule `:root[data-theme="obsidian"] .account-workspace .mobile-settings-menu
{display:flex}` outranked the generic hide rule by specificity, so the menu never left and the opened
section sat below it. Fixed with an equally scoped hide rule for the menu, profile summary and sign-out
row. `tests/settings-drilldown-css.tsx` now computes `display` with the real stylesheets per view and
fails on the old CSS. The notifications page also gained a close control (returns to the in-app origin
of the tap, or to the wallet home when opened directly) and a centred title row with the settings link
as an icon.
