# Account-aware wallet interface

The previous dashboard always fetched the shared demonstration wallet, including after successful email verification. The header never consulted the authenticated session. This made a newly created account appear to own SC-8901 and its $2,450.75 sample balance.

The overview API now resolves the HttpOnly session on the server. Authenticated responses contain only the corresponding `User.balance`, queried using the session user ID as a parameter, with the signed-in identity. Balances stay decimal strings until display formatting; no float conversion is used for account balances. New accounts retain their persisted zero starting balance. Account transaction history is explicitly marked unavailable, not populated with demonstration entries. This is not an implementation of account-specific posting/history.

Guest responses remain explicitly marked as demonstration data. Auth/database failures return 503 with no balance or transactions and never fall back to the shared demonstration wallet. Initial UI state does not show seeded balances/transactions; it waits for the overview request. The header shows signed-in email, account access, and a working POST logout control. Focus refresh rechecks the session and clears old transactions/modal/PIN state while loading.

Registered accounts do not yet have a live receiving wallet or integrated financial services. The UI does not generate a personal QR using the demonstration ID, and the deposit API rejects placeholder generation for authenticated users. All four debit routes still require passkey approval; the common final guard now refuses the shared-demo mutation even after a valid approval is consumed. This prevents real email accounts from changing somebody else's demonstration balance. It does not replace the future persistent per-account ledger, KYC, provider integration, or durable passkey implementation.

Tests cover user-scoped overview queries, zero/different-user balances, exact decimal display, explicit inactive-service/history flags, failed lookup rejection, guest demo marking, API failure behavior without a database, and existing payment authorization boundaries. Successful hardware passkey flows and an authenticated browser using the hosted database are not claimed as automated tests.

## Account routing boundary

Account routes `/dashboard`, `/deposit`, `/withdraw`, `/sham-cash` and `/mobile-topup` now share a server-rendered `(account)` layout. It validates the actual database session before rendering and redirects guests/expired sessions to `/auth`; cookie presence alone is not authentication. Session/database outages fail closed with an error screen, not visitor/demo account content. The root `/` and `/auth` check the same verified session and redirect signed-in users to `/dashboard`.

After OTP verification, the browser replaces the auth-page history entry with `/dashboard` using a full navigation so stale public Router Cache content is not reused. Client-side account refresh also returns an expired session to `/auth` and sends an authenticated visitor-page instance to `/dashboard`. Private navigation, header/footer branding links and footer account access stay within account routes; public marketing navigation is shown only on the visitor page. Account layout/session reads use dynamic server rendering, not shared static HTML.

`test:routing` checks the structural wiring. Running API tests assert actual anonymous HTTP 307 redirects on every protected route and invalid-session fail-closed behavior; successful authenticated browser navigation requires a real sign-in and is not claimed as an automated test.

## Account settings

`/settings` is inside the same verified-session route group. It displays only the signed-in account's email, account ID and actual email-verification status. Account ID copying, browser-local Arabic/English preference, private navigation back to the wallet, and server-revoking current-session logout are functional. Dashboard account identity, navigation and tabs link to settings.

Profile identifiers are read-only. Email changes, password changes, device/passkey management and logout-all-devices are not implemented and are not presented as working actions. Language is explicitly saved only on the current browser/device, not persisted to the database. No secrets are read or shown. Static-render tests cover identity/status rendering and absence of secret fields; API tests include authentication guarding of `/settings`. Hosted authenticated browser interaction must still be confirmed by the account owner.
