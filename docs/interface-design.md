# Horizon / SiroCash interface

Horizon replaces the preceding Clarity presentation. This is a composition and navigation change, not another imported theme layer. `app/professional.css` has been replaced, not appended as a new stylesheet. Historical shared CSS remains underneath for ancillary screens and low-level legacy controls; its removal is separate technical debt.

## New compositions

- `ModernLanding`: editorial cover with a custom decorative sculpture, full-width interactive service stage, service directory, security narrative, linear onboarding and FAQ. No phone/dashboard mockup or fabricated balance/activity on the landing page.
- `ServiceShowcase`: three selectable experience descriptions with one active button, a matching destination and an explicit preview/inactive-services notice.
- `VaultOverview`: capital canvas, separate asset/network explorer, horizontal service directory and account control panel. Only the existing projected account balance is passed in; asset links do not represent customer holdings. Privacy masks the capital amount and still propagates to the financial history.
- Account navigation: horizontal desktop navigation in place of a vertical rail, with the existing five-destination mobile navigation. All service routes remain available. Quick access has its own accessible name when its visual label is hidden.
- Authentication: split identity/credential workspace, custom decorative brand artwork, unboxed form; the previous product-preview component has been removed.
- Settings: profile/preferences column beside a broader security workspace; reordered into one column on mobile.
- Payments: details → review → device-approval progress. Prepared forms are replaced visually by their immutable review; editing restores details. No route, payload, approval binding, idempotency, unknown-outcome protection, limit or activation gate has changed.

## Preserved financial behavior

Shared owner-bound SSE and no healthy polling remain unchanged. Financial tables/cards, current/unknown/reserved state distinctions, copy feedback, explicit UTC dates, and latest-30-record search/filtering remain. Amount strings are never converted to floating point. Service availability is explicit, and no real-money feature has been activated by this redesign.

## Verification scope

`npm test` covers typechecks and existing financial/authentication regressions, plus bilingual SSR contracts for the new service stage and private overview, privacy and navigation. Headless local Chromium checked landing at 1440/390/320px, English authentication and password visibility at 1440/768/390/320px, persisted LTR language and service-stage selection. Separate browser-only synthetic fixtures exercised the real overview, navigation and financial history at 1440/1000/768/390/320px in both languages, including history search/filter, balance masking propagated into history, and quick-access dialog open/Escape close. No document overflow or page runtime errors were observed in these checks.

Browser fixtures, screenshots and optional test browser packages remain outside source delivery in `.cache`/`node_modules`. These checks do not certify a mounted production customer SSE session, physical-device behavior, all accessibility requirements or live financial execution. No customer account or financial operation was created during visual verification.
