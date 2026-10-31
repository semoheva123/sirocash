# TronZap integration — read-only

Official reference reviewed 2026-10-31:
- https://docs.tronzap.com/api/authentication.html
- https://docs.tronzap.com/api/balance.html
- https://docs.tronzap.com/api/calculate.html

Server-only client signs EXACT serialized JSON body + API secret with SHA256 (as documented; not HMAC). Fixed api.tronzap.com host, no redirects, no caching, 10s request timeout, bounded 64KiB response, sanitized errors. Only /v1/balance and /v1/calculate are callable. No purchase, subscription or wallet-signing endpoint. Check cost response matches exact address/quantity/duration/type and price+activation=total. Numeric provider values normalized to bounded decimal strings; these are estimates, never USD ledger credits or binding purchase caps.

Production-only sensitive TRONZAP_API_TOKEN and TRONZAP_API_SECRET were reported configured in Vercel previously; this change does not read/decrypt them from the control plane. Do not paste credentials in chat. Never use NEXT_PUBLIC_ names.

`npm run energy:check` skips by default. In a reviewed server-side environment with credentials, TRONZAP_READ_CHECK=true checks balance/authentication and estimates 65000 energy for one hour at the owner's operating address. Logs only sanitized status, balance and estimated costs. It cannot purchase, move funds, bind price or certify later delegation. Do not expose it as an unauthenticated HTTP route. No automatic build hook: adding variables alone does not run this script.

`npm run test:tronzap` uses mock credentials/transports, not owner credentials. Successful mock tests do not prove live authentication. Live result must be reported separately and requires executing in an authorized environment that has the configured sensitive secrets and network access. No paid test, new deployment or production configuration change is performed by this module.

## Live read-only result — 2026-10-31

Executed on Vercel using the existing production-only sensitive variables, without retrieving/exporting their values. Probe deployment dpl_4CxRPKDi61aMg7aBJpMpqgvofSyk from commit488be6c2c85b7e936bf6206b7b8d1afb80d6ead4:
- /v1/balance authentication SUCCESS; balance0TRX.
- /v1/calculate SUCCESS for operating address TFMUACLuYyFcw9YzrAgESnQ9a6pvEiY1bL,65000Energy,1hour: price2.45TRX, activation_fee1.4TRX,total3.85TRX.
- Provider estimate only. Activation is a provider-reported quote component, NOT independently established chain activation state. No order, no delegation, no purchase, no blockchain broadcast, no database access.
- Probe intentionally exited1 after emitting SUCCESS to prevent artifact deployment/promotion. ERROR status is intentional, not an API failure. Original production deployment dpl_CbLpXmRG95f8WB6zKBWkwddEnTXc independently verified READY/PROMOTED with sirocash.vercel.app still assigned. Normal vercel.json restored in subsequent branch commitaa0e013.

Live auth and estimate are now verified; actual paid purchase, enforceable price cap, idempotent recovery and on-chain delivery remain untested. Current production app still does not expose the new read-only client or any live payment execution. Never redeploy the historical probe commit expecting a functioning app; it intentionally cannot publish.
