# Production canonical account origin

On 2026-11-03 the production `WEBAUTHN_ORIGIN` was changed from
`https://sirocash.vercel.app` to `https://www.sirocash.online` in Vercel.
The existing verified apex domain `sirocash.online` has a Vercel 308 redirect to
`www.sirocash.online`; that routing was retained, not reversed. No DNS change or
permissive origin list is required.

The fix is deployment configuration, not a removal of CSRF protection. The
same fixed origin is used for account mutations and WebAuthn's expected origin
and RP ID (`www.sirocash.online`). Device credentials created for the old
`vercel.app` RP cannot transfer across unrelated domains; the existing backend
selects credentials per user **and RP ID**, so the new domain uses its normal
registration path. Email/password login plus email verification remains the
account entry path. Browser authentication cookies are host-scoped; users may
need to log in on the custom domain rather than reuse the old host's session.

A production rebuild of source commit
`39c0b2a7af8278bab15e8b3bed53ceeb0db3e602` was requested as
`dpl_6CpayXhA7aTknMGbSSsp1qoWDkUN`. Account-continuity changes in the working branch
are **not** part of this configuration-only production rebuild. No ledger,
monitoring scheduler, provider secret, financial capability or KYC flag changed.

Checks: `npx tsx tests/canonical-domain.ts`, `npm run test:durable-passkey`,
`npm run test:http-hardening`. These are isolated tests, not a real customer
sign-in or an authenticated production transfer. Public fetch confirms that
`https://sirocash.online/auth` resolves to `https://www.sirocash.online/auth`.
Use the custom domain for customer login; the legacy Vercel hostname remains
available for existing internal scheduler URLs and is not an additional trusted
browser-authentication origin.

Publication confirmed: deployment `dpl_6CpayXhA7aTknMGbSSsp1qoWDkUN` is
`READY` / `PROMOTED`, `aliasAssigned=true`, with `sirocash.online`,
`www.sirocash.online` and the existing Vercel alias. Production source SHA matches
the requested existing release. A real authenticated customer login/OTP completion
was not executed by the agent.
