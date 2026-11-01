# Obsidian workspace redesign

## Scope

A shared presentation system now covers the public landing page, sign-in/OTP screen, dashboard, deposit/withdrawal gateways, Sham Cash, mobile top-up, and account settings. `app/design-system.css` defines the material, palette, type hierarchy and responsive overrides; `components/account-navigation.tsx` is the single private navigation component. Existing styles are retained as a compatibility layer underneath the new system, rather than rewriting financial/authentication logic in the same change.

- Obsidian surfaces with restrained mint, champagne and slate accents, consistent rounded corners, lower-noise glass and borders.
- Locally bundled variable Manrope and Noto Sans Arabic fonts; no Google Fonts runtime requests or network dependency. Arabic/RTL is the initial experience; the existing browser language setting switches to English/LTR.
- Persistent side navigation on desktop, six-destination bottom navigation on mobile, correct active-page indication, safe-area padding, settings included in the same workspace.
- Dashboard hierarchy: verified-account identity, own persisted balance with a hide/show control, receiving availability, service shortcuts and explicit empty transaction history. No invented graph, income, personal funds or activity.
- Dedicated inactive service states for Sham Cash and top-ups instead of a bare paragraph; digital asset/network selection and safety explanations remain intact.
- Unified profile/security/preferences cards, input/button language, two-step password/email-OTP form, sign-in panel and purpose-specific error/status styles.
- Keyboard focus, visible active navigation, reduced-motion preference, logical CSS mirroring and 360px+ mobile layouts.

## Security boundary

No server authentication guard, password/OTP policy, database permission, ledger or financial-service activation was changed. Guest demo visuals remain only on the public page. Authenticated accounts still receive their own persisted balance and no shared demo history; inactive services remain labelled as such. The password-change email sender trial restrictions are unchanged.

## Verification

- Full existing domain/security test suite and production build.
- `npm run test:design`: shared navigation in both locales, account-safe first paint, local font imports, RTL/mobile/reduced-motion rules.
- Local Chromium visual review: landing and sign-in, plus the real client components for all six private pages in Arabic and English at 1440, 900, 760, 390 and 360px (60 combinations). Checked no document overflow and exactly one active navigation item. Reviewed dashboard, settings and deposit screenshots on desktop/mobile.
- Browser component fixtures checked balance hiding and the real two-stage password form using intercepted fixture API responses. The private visual fixtures were ephemeral, were NOT deployed, and did NOT disable or bypass server guards. Their sample account data was synthetic. These are UI tests, not a hosted authenticated sign-in, inbox-delivery or financial-operation proof.
- Local production API tests retain anonymous redirects and fail-closed behavior for every private route.

Local visual-review assets are ignored under `.cache/`, and are not bundled into production or committed.
