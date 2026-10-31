# Security remediation — 2026-10-31

## Implemented and locally validated
- Kept TronWeb 6.5.1 and updated its Axios resolution through an explicit `^1.20.0` override (lockfile resolves 1.21.0). Fresh `npm audit --audit-level=low`: ZERO known vulnerabilities at review time. No force downgrade or breaking `audit fix --force` used. Audit is not a security certification.
- Generic HTTP/auth error boundaries no longer expose arbitrary Error/provider/SQL messages. Only deliberately authored PublicApiError messages may pass through; API errors carry no-store. Added regression tests, including upstream errors containing Arabic text.
- Mutating same-origin routes require an Origin and reject cross-site fetch metadata. Production requires an explicit canonical WEBAUTHN_ORIGIN; spoofed Host/X-Forwarded-Host cannot authorize a foreign Origin. Browser-origin checks do not replace authentication, session permissions or infrastructure throttling.
- Added nosniff, same-origin referrer policy, limited browser features and API no-store headers without blocking camera-based identity capture or preview iframe embedding. A nonce-based CSP remains a separately scoped integration, not claimed implemented.
- The former TRON reserve address was reassigned by the owner to deposits. Removed it from the reserve configuration. TRON reserve lookups now fail closed until a new public reserve is intentionally provisioned. No reserve key is loaded, no auto-refill authorization exists.
- Added private `custody:check` command: opt-in, production-only, requires signer explicitly false, validates operating ownership and account-level xpub/xprv/public first address without signing, network requests or database writes. Its outputs are booleans/fixed sanitized errors, not keys. Tested only with deterministic fixtures; invoking without opt-in reports SKIPPED.
- Added pinned-action CI for frozen install without lifecycle scripts, low-threshold audit, full offline tests and build with financial flags disabled and no production secrets.
- Reconciled local Git tracking to the fetched authorized branch using a mixed reset AFTER verifying every one of its 258 tracked files matched local file hashes; no application file was overwritten or deleted. New work and the prior review document were preserved.

## Validation
Full `npm test`, `npm run build`, targeted security boundary/treasury-role tests and `git diff --check` passed locally after remediation. Operating/deposit secrets were NOT decrypted, requested through chat or embedded in source. The production preflight was NOT executed. New CI configuration is prepared; local success does not claim a GitHub job has completed.

## NOT a production launch approval
Live paid energy ordering, enforceable pre-purchase shared budget, resource/provider delivery/recovery, authenticated complete TRON/BSC observers, unified operating nonce consumers, real-device enrollment/recovery, approved valuation/pricing authority, independent PostgreSQL concurrency and funded crash/deep-reorg/failure drills remain launch blockers. Prepared migrations are not assumed deployed; runtime financial services remain blocked.

The code now includes protected preflight machinery, not proof that the owner's saved keys match. A separately reviewed production-isolated invocation must set SIRO_CUSTODY_PREFLIGHT=true, SIRO_TRC20_DEPOSIT_FIRST_ADDRESS to the independently verified public reference, and keep SIRO_SIGNER_ENABLED=false. Never download/export production secrets to run this on a developer machine or pass them as command-line arguments. Do not wire the command into a public route or regular build. It deliberately cannot activate custody or provision DB wallets.

No secret/environment change, deployment, paid provider order, DB financial migration or transaction broadcast occurred in this remediation. Keep signing disabled and do not fund for a drill yet.
