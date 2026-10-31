# Identity storage: private Cloudflare R2 + D1

## Current deployment boundary

The account-owned Cloudflare token was verified through GitHub Actions, without exposing its value. The account ID is `54cf1f9f742ce2f8b674b2c3fa2cee51`. The first resource-provisioning attempt failed because **Cloudflare R2 is not enabled** (provider code 10042). The owner must activate R2 in the dashboard and accept any billing requirements. No billing method, subscriptions, domains or unrelated projects were changed. That first failed attempt created no resources. A subsequent D1-first run successfully created the project D1 database `12a1811a-31fe-47c9-9e93-2ac86e7599a4` and applied both identity migrations, then again stopped at R2 activation. No identity bucket or Worker has yet been created; collection remains disabled.

`CLOUDFLARE_API_TOKEN` stays in GitHub repository Actions secrets. The application never receives this broad deployment credential. The workflow creates/reuses only `sirocash-identity-private` and `sirocash-identity`, disables managed bucket public access, refuses enabled public custom domains, and emits only non-secret resource IDs/status. The D1 ID in committed binding configuration is a confirmed non-secret resource ID. Generated deployment configuration is ignored by Git. Once R2 is enabled, the workflow is prepared to deploy the Worker with only the project bindings, hourly cleanup and secret preservation, refusing an unrelated existing Worker and checking anonymous denial. It does not enable application collection or invent matching application service credentials. No user identity images or private tokens belong in artifacts, logs, repository files or chat.

## Owner-selected account-lifetime retention

The owner explicitly selected: retain documents while the account remains registered and not closed. This means **no automatic expiry due to inactivity or elapsed days**, not evidence about a person's biological life. Consent version `identity-v2-account-lifetime` discloses the policy and early document withdrawal/deletion. R2 must not have an age-based lifecycle rule deleting these copies.

- `IDENTITY_RETENTION_POLICY=account_lifetime` is the selected configuration. Legacy fixed-days requests keep their original policy and consent; existing records are never silently extended.
- D1 stores an internal sentinel for account-lifetime expiry, but APIs return `expiresAt: null` plus `retentionPolicy: account_lifetime`; customers/reviewers never see a fictitious far-future date.
- `/api/internal/identity-lifecycle` is authenticated by a 32+ character `CRON_SECRET` and runs on a daily Vercel schedule (`02:37 UTC`). It obtains a complete successful snapshot of registered primary-database User IDs, HMAC-pseudonymizes them and reconciles the private Worker. It never sends email, identity numbers or extracted text.
- A missing session, unverified email, inactivity, database error, partial pagination, stale snapshot or oversized (>10,000 accounts) snapshot must never imply account closure. Such failures stop synchronization. A 10-minute creation grace window protects accounts/documents created concurrently with a snapshot. Larger installations need an explicitly designed paginated snapshot protocol before raising the bound.
- Confirmed absent primary accounts are marked closed in D1; new submissions are blocked during cleanup, files are deleted with retries, and related request/audit/quota records are removed only after all expected objects are confirmed deleted. Reviewer references in other users' retained records are de-identified. An in-flight upload has a 10-minute safety window before cleanup so its key manifest cannot be deleted before object writes finish.
- Early withdrawal removes document copies but does not delete the primary account or its minimal review/audit records. Account removal then removes those remaining identity records. No blanket claim is made about deleting ledger/account/security records in PostgreSQL.
- The application does **not** yet provide a customer self-service primary-account closure flow. The reconciler handles confirmed primary-account removal; it does not invent a closed state from session revocation. A supported closure workflow must eventually invoke/rely on this lifecycle mechanism.
- Account-lifetime collection fails closed unless `IDENTITY_LIFECYCLE_ENABLED=true` and `CRON_SECRET` is configured. Successful deployed synthetic lifecycle checks are required before activating these flags. Worker cron is a retry/cleanup mechanism, not an exact-time deletion SLA.

## Intake and review controls

Verified account session + verified email → bounded same-origin Next intake → backend-only Worker → private JPEG copies in R2 / pseudonymous metadata in D1. Account/wallet data remains in PostgreSQL. No financial activation or KYC status is inferred from document intake.

JPEG/PNG only; 1.5 MB per image, 3.2 MB bounded multipart body, 12M decoded pixels, minimum 600px on each side, normalized to <=2400px. Sharp re-encodes JPEG copies and strips EXIF/location metadata; original files are not retained. No PDF/SVG/animated images or remote URLs. Four persisted attempts per user/day and a synchronous one-upload-per-instance processing gate precede OCR.

Tesseract.js runs locally on the application server with packaged Arabic/English models, not a third-party OCR service/CDN. Only confidence/character counts and image contrast/dimensions are retained, never extracted names/numbers/text. Recognition has a 25-second timeout and worker termination; initialization/cold-start and actual hosted memory limits still need deployed testing. Libraries have no license fee; infrastructure/compute can incur usage costs.

This is human document review, **not** certified KYC, document authenticity/ownership proof, face matching, liveness or sanctions screening. No separate selfie or biometric template is collected. No automatic/self approval. Reviewer access requires a server-side UUID allowlist, verified session/email, current-password recheck for each action, separate review token, persisted attempt limits and audit records. An owner-approved reviewer Access/MFA perimeter is required before enabling review; the enable flag does not itself implement/verify that perimeter. Temporary browser Blob previews are revoked on close/unmount.

No public R2 URLs; HTTPS, independent intake/review tokens, no-store/sandbox/attachment headers. R2 platform encryption is not operator-exclusive/end-to-end encryption. A complete key manifest precedes R2 writes; partial failures remain discoverable and retryable. Disabling new collection does not prevent status access or document withdrawal while storage credentials remain configured.

## Remaining activation steps

1. Owner activates R2 and reviews billing. Re-run the project provisioning workflow. Never weaken scoped credentials to resolve a billing-disabled response.
2. Apply both D1 migrations, deploy the Worker, configure independent server-generated intake/review secrets, and securely configure the matching SiroCash application server secrets. Never copy the deployment token into the app. A working verification workflow is not yet a completed app/Worker integration.
3. Configure stable `IDENTITY_SUBJECT_SECRET`, Worker HTTPS origin, lifecycle/cron credentials and explicit reviewer UUIDs. Keep `IDENTITY_COLLECTION_ENABLED=false` until testing succeeds.
4. Approve operator/privacy/rights contact, legal basis, jurisdiction/data residency and reviewer perimeter. Account-lifetime retention is the owner's instruction, not an independent legal compliance conclusion.
5. Test synthetic uploads/review, privacy/authorization, token rotation, partial failures, early withdrawal, registered-account retention and confirmed account-removal cleanup against deployed resources. Confirm cron/retry monitoring, backups/deletion behavior, function size/memory/cold-start limits and load handling. Then enable collection/review separately.

## Validation

`npm test` includes `test:identity`: actual local Miniflare D1/R2 bindings, synthetic images, packaged Arabic/English OCR, metadata stripping, quotas, concurrent-open rejection, injected partial R2 failure cleanup, no self/automatic approval, audited reviewer reads, withdrawal, legacy expiry, account-lifetime non-expiry, fresh/complete snapshot validation, retention of registered accounts and deleted-account cleanup. No real documents or hosted account credentials are used. Browser fixtures cover Arabic/English mobile/desktop intake and private reviewer preview behavior; these are not proof of a real Cloudflare/Vercel end-to-end deployment.
