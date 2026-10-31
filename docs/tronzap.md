# TronZap integration — read-only

Official reference reviewed 2026-10-31:
- https://docs.tronzap.com/api/authentication.html
- https://docs.tronzap.com/api/balance.html
- https://docs.tronzap.com/api/calculate.html

Server-only client signs EXACT serialized JSON body + API secret with SHA256 (as documented; not HMAC). Fixed api.tronzap.com host, no redirects, no caching, 10s request timeout, bounded 64KiB response, sanitized errors. Only /v1/balance and /v1/calculate are callable. No purchase, subscription or wallet-signing endpoint. Check cost response matches exact address/quantity/duration/type and price+activation=total. Numeric provider values normalized to bounded decimal strings; these are estimates, never USD ledger credits or binding purchase caps.

Production-only sensitive TRONZAP_API_TOKEN and TRONZAP_API_SECRET were reported configured in Vercel previously; this change does not read/decrypt them from the control plane. Do not paste credentials in chat. Never use NEXT_PUBLIC_ names.

`npm run energy:check` skips by default. In a reviewed server-side environment with credentials, TRONZAP_READ_CHECK=true checks balance/authentication and estimates 65000 energy for one hour at the owner's operating address. Logs only sanitized status, balance and estimated costs. It cannot purchase, move funds, bind price or certify later delegation. Do not expose it as an unauthenticated HTTP route. No automatic build hook: adding variables alone does not run this script.

`npm run test:tronzap` uses mock credentials/transports, not owner credentials. Successful mock tests do not prove live authentication. Live result must be reported separately and requires executing in an authorized environment that has the configured sensitive secrets and network access. No paid test, new deployment or production configuration change is performed by this module.
