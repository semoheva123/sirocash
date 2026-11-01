# Clarity interface / November 2026

The interface update covers the landing page and product illustration, wallet and service surfaces, shared desktop/mobile account navigation, payment workspace, authentication, settings, and financial history. `app/professional.css` is the final product-wide visual contract; historical styles remain underneath for legacy/ancillary surfaces. It does not remove those stylesheets.

## Components and behavior

- `PlatformPreview` is a labelled illustration with wallet/security tabs, never an issued payment card or an actual balance. Used on landing and authentication.
- `financial-ui.tsx` shares explicit state badges, empty states, UTC dates and copyable ledger/network references. Clipboard failure is reported instead of showing false success.
- `FinancialActivity` searches and filters the records already received from the shared owner stream. Search is **not** a database-wide search; each list still contains its latest 30 records. Desktop uses a semantic table; narrow viewports present the same records as rows/cards without document-wide horizontal overflow.
- Amount strings are not rounded or converted to floating point. Balance privacy masks posted/held balances and movement/command amounts. Transaction references are identifiers, not signed transaction payloads.
- The account rail is visible above 900px; a safe-area-aware five-destination bottom navigation is used below that width. Each navigation has its own active destination. Existing service tabs and quick access remain available.
- Payment workflows, authentication, ownership checks, fees, caps and financial activation gates are unchanged. The old authentication marketing phrase promising zero internal fees has been removed; fees are shown before approval.
- SSE, one owner-bound provider, and no healthy polling remain unchanged. An inactive financial service has an explicit non-operational empty state, not demo transactions.

## Verification

- Full `npm test`, including typecheck, existing financial streaming/ownership checks, and new `professional-interface.tsx` SSR contracts.
- Local headless Chromium: landing at 1440/390/320px and authentication at desktop; no page runtime errors or landing document overflow. Actual authenticated production sessions were not used.
- Separately mounted **synthetic test fixtures**, never a public application route: real financial history/navigation components at 1440/1000/768/390/320px in Arabic and English; search and movement-type filter exercised, no page runtime errors or document overflow. These checks do not certify a live customer SSE session, actual financial execution, physical-device behavior or all accessibility requirements.
- Temporary browser dependencies, bundles, fixtures and screenshots are excluded from source delivery under `.cache`/`node_modules` and are not production features.
