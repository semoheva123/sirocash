# SiroCash / Everyday — modern fintech

The user explicitly rejected the conservative dark Signature Atelier presentation and selected **modern global fintech** from three visual directions. This supersedes the prior visual direction; its operational/security limits are unchanged.

## What changed

- White/daylight surfaces, cobalt blue, electric-lime accents, stronger type and larger controls. `fintech.css` is the final visual layer; the earlier shared files continue to supply base layout rules.
- `ModernLanding` replaces the old landing composition entirely: new headline, asymmetric four-service bento, onboarding steps, illustrated security area and a bold closing call to action.
- `SignatureVisual` is now an interactive illustrated **app**, not a metal payment card. Wallet/security switches work. Balance remains hidden/illustrative; no wallet address or actual customer activity is invented.
- Dashboard adds `AccountEssentials` and `AccountAssetCards` instead of a nonfunctional receiving-card showcase. Account email verification follows the actual loaded state; loading, error and unverified labels use neutral styling. Financial services remain explicitly inactive.
- USDT/USDC dashboard links select a validated asset and its supported default network on the deposit screen. They are exploratory links, not deposit activation.
- Login links use `/auth?mode=login`; the auth form honors that query while preserving recovery/password-change login behavior.
- Authentication, recovery, account settings, service pages, information centre, dialogs, command navigation, 404 and account errors share the new light theme.
- Mobile has a compact auth introduction and readable single-column controls rather than a scaled desktop marketing composition.

## Boundaries

No backend permission, ledger, credential workflow, hosted database migration, custody provider or financial activation changed. No live fees or operating calendar were invented. Sham Cash retains the one-to-24-hour information for designated operating days, explicitly saying the actual calendar is unpublished. Public landing artwork contains no fabricated payment receipt, balance, card issuer, chart or customer testimonial.

## Validation

`npm test` now includes `test:modern` for bilingual landing structure, truthful artwork, inactive states, neutral account-state styling, asset deep links and theme contracts. Production build and API regression remain required. Browser review uses actual public routes and synthetic private component fixtures; it is not a real hosted sign-in, email delivery or device-verification test.

Browser checks cover public/private AR/EN layouts at desktop/tablet/phone sizes, product-preview switches, search dialog keyboard behavior, balance privacy, settings anchors, valid asset selection from URLs, and login-mode selection. Generated review screenshots/bundles belong in ignored `.cache`, not source control.
