# Exact-path static price CSP repair

The independent Pages file/CORS proof did not test the wallet document's own Content Security Policy. `proxy.ts` sent `connect-src 'self'`, which blocks the separate public JSON fetch. An available/CDN-valid file can therefore still produce “Rates could not be loaded” in the wallet. Previous synthetic wallet fixtures did not carry that actual policy; passing them did not establish production-browser integration.

## Repair
- Share only the public URL constant in `lib/static-exchange-location.ts` between the reader and proxy. The proxy does not import the reader, Zod, source collector, database or any credential.
- Add exactly `https://semoheva123.github.io/sirocash/rates.json` to `connect-src`, alongside `'self'`. No `*`, wildcard subdomain, whole-CDN origin, script allowance, or relaxation of nonce/frame/object/form protections.
- Keep cookies/referrer omitted, redirects rejected, the 5s timeout, response-size/age/schema checks and legacy DB-backed price routes disabled.

## Permanent regression
- HTTP hardening asserts the exact connect directive and identical forwarded/response CSP, alongside existing nonce/HSTS/frame checks.
- Real Chromium loads a page served with the **actual proxy-generated production CSP** and the **actual static reader**. A synthetic cross-origin response avoids any live provider dependency.
- Negative control removes just the new allowlist entry and reproduces unavailable/zero upstream reads. Fixed policy yields validated prices; sibling files/projects and unrelated origins remain blocked before network. Self fetch, nonce-authorized script and local UI interaction remain functional. No cookies/referrer or financial requests.
- A dedicated CI browser job installs the pinned Playwright browser and runs this test. It does not make wallet releases depend on availability of SP Today or GitHub Pages.

This proves the CSP integration repair, not elimination of all historical freezing causes or authenticated device acceptance. Exact production deployment/CI status belongs in the release audit.
