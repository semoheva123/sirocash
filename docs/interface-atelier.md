# SiroCash / Signature Atelier

## Design direction

Deep jade, champagne and warm ivory, with locally hosted Manrope and Noto Sans Arabic. Luxury is expressed through hierarchy, precise spacing, restrained materials, readable copy and useful controls rather than fabricated financial activity or excessive motion.

- `signature.css`: core presentation across landing, authentication, account, settings and services.
- `atelier.css`: interactive product storytelling, service-information cards, information centre, recovery, command navigation and resilient route states.
- `SignatureVisual`: original CSS/SVG brand illustration, explicitly not an issued payment card.
- `ExperienceSection`: three functional product-preview controls using Framer Motion and reduced-motion preferences. No actual customer balance or security events are displayed.
- `ServiceBrief`: execution, fees and availability presented before entering each service flow.
- `WorkspaceSearch`: real section navigation with Arabic/English keyword matching, Ctrl/Command+K, arrow navigation and an explicit empty state. Does not search private account data.
- `DialogFrame`: body portal (outside the sidebar's stacking/containing context), localized dialog label, focus containment, Escape dismissal, focus restoration and scroll locking. Dismissal is blocked while an operation is pending.
- Information pages have an active navigation state, unified brand header, policy notice and responsive editorial layouts.
- Account recovery, 404 and error destinations share the platform's visual identity. Account failures never fall back to demo financial data.

## Financial and operational truth

- Registered accounts' financial services remain inactive. No custody, settlement, top-up provider or financial operator was added by this design work.
- Sham Cash execution is described as **one to 24 hours during designated operating days**. The owner has not supplied the days, hours or timezone; no schedule or outside-hours countdown has been invented. The interface explicitly says the operating calendar has not been published.
- Live fees are not approved. Simulation fees are not operational pricing. No blanket promise that blockchain/network/provider fees are zero was added.
- Public metadata no longer advertises live instant transfers.
- Password changes still require the existing email approval. No auth, ledger, permission or hosted database migration changed.

## Validation

- `npm test` includes `test:atelier`, covering bilingual financial disclosures, honest product previews, information navigation, the command trigger, route destinations and design accessibility contracts.
- Production build and local API regression suite.
- Browser review: 64 public route/locale/viewport combinations (eight routes, AR/EN, 1440/900/390/360 px), and 36 private component-fixture combinations (six sections, AR/EN, 1440/390/360 px).
- Checked horizontal overflow and uncaught browser exceptions; interactive preview switches; active rail/document navigation; balance privacy; settings anchors; command search and no-results; portal placement; Escape dismissal and focus restoration.
- Private browser review uses intercepted synthetic identity/empty activity, not a real hosted login. It is not a delivery, biometric-device, financial-settlement or independent security audit.

Build database preflight is skipped when no local database environment is configured. Existing hosted database and other Vercel projects are outside this design change.
