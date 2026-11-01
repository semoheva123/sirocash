# Ledger-only internal transfers

Authorized 2026-11-01; separate from external custody execution.

- Production flags added: `SIRO_INTERNAL_TRANSFERS_ENABLED=true` and `SIRO_DURABLE_PASSKEY_ENABLED=true`. No other activation flags changed.
- Canonical device-approval origin remains `https://sirocash.vercel.app`. Use that origin for account access and device approval; aliases do not create cross-origin passkeys.
- Dashboard Send → SiroCash account → recipient UUID (or `sirocash:pay:UUID`) → secure review → device approval. No automatic execution from query parameters.
- Sender-added 1%: USD 100 principal → sender debit 101, recipient credit 100, fee-pool credit 1. Existing ledger rounding rules apply to fractional amounts.
- Authenticated session, verified recipient, no self-transfer, reserve-aware available balance, request fingerprint, atomic durable approval consumption and balanced journal remain mandatory. Retrying the identical request is idempotent; changed data is rejected.
- The legacy `/api/wallet/transfer` now uses the real customer command boundary, not demo PINs or cached-balance mutation.
- Realtime owner-bound ledger reads and transaction history use the existing shared SSE connection.

## Verification

Full `npm test`, TypeScript, local production build and isolated PostgreSQL 17.11 financial acceptance passed. The real PostgreSQL fixture tests include actual customer-command approval consumption, exact replay, changed-command rejection, expired sessions, concurrent overspend, rollback and owner-only committed notifications. Synthetic approvals exist only in isolated tests.

Production build for implementation SHA `18d8255ad6c88e2122017e12ddbcdb693ec8e11c` verified TLS/restricted roles, schema isolation, read-only snapshots, event delivery and the new internal preflight. Deployment `dpl_DDEUp8FhcaymJN9bQkd8NcU4vUr3` reached READY/PROMOTED. Public unauthenticated `/payments` redirects to authentication; the financial status endpoint rejects unauthenticated access.

The internal preflight runs in a PostgreSQL-enforced read-only transaction. It validates two distinct configured USD `MASTER_POOL` accounts with null user ownership and a balanced journal; it never creates balances or performs a transfer. Publication is blocked if it fails. External withdrawal, signer, outbox, native-gas, broadcast, automatic preparation and provider-purchase activation gates remained off, confirmed by production readiness output.

Follow-up SHA `8585333964fb93ccdd95bdaeaf157bdff228a393` corrects public/account copy to distinguish internal transfers from disabled external withdrawals. Its full regression suite passed; its production preflight again reported VERIFIED for internal transfers.

No real customer's biometric/device approval was impersonated and no production customer transfer was performed. Production end-to-end customer-device acceptance is therefore not claimed. An account must have legitimately posted available funds; this release does not fabricate a funding balance or enable external execution.

Final publication: `dpl_GCvHwMEFmvRNkvqE99mx8SdSRFFs`, SHA `8585333964fb93ccdd95bdaeaf157bdff228a393`, READY/PROMOTED, aliases assigned at `1793567331155`. The published `/trust` page was fetched and verified to describe internal 1% sender-added transfers separately from disabled external withdrawals. Final local production build also passed. No deployment remains pending from this work.
