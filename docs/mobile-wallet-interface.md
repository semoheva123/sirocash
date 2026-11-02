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
