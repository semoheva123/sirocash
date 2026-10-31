# Isolated identity intake: Cloudflare R2 + D1

## Current boundary

Implemented and locally tested; **Cloudflare is not connected/provisioned in this session**. No real identity document has been collected or uploaded. Collection is disabled by default. Nothing migrates the PostgreSQL account/ledger database or enables money movement. Never upload real identities for testing.

This is document intake with **human document review**, not certified KYC, document-authenticity assurance, face matching, liveness, sanctions/PEP screening or a regulatory eligibility decision. Open-source libraries have no license fee; hosting, Workers, D1, R2 and compute are subject to actual account limits/billing. No free-service guarantee is made.

## Architecture and controls

- Settings → `IdentityVerification` → authenticated Next `/api/identity` proxy → backend-only Worker → private R2 images / D1 request metadata.
- Reuses verified database sessions and requires verified email for submission. Owner identity comes from the server session, never a browser field.
- Stable HMAC pseudonyms link D1 records to account UUIDs; emails, original filenames, identity numbers and extracted OCR text are not stored in D1. Pseudonyms/diagnostics are still personal data, not anonymous data.
- Upload requires same-origin POST, explicit versioned consent, and an unchanged owner-approved retention period. No document intake while configuration is absent. Disabling new collection does not disable status access or withdrawal/deletion while storage credentials remain configured. Three document categories: national ID (two images), residence permit (two), passport (data page only). This is not a claim that every country's documents can be authenticated.
- JPEG/PNG only, 1.5 MB per input/output image, 3.2 MB bounded multipart body, 12M decoded pixels, minimum 600px per side. Sharp 0.35.5+ decodes/re-encodes a JPEG copy, strips EXIF/location data, rotates and limits dimensions to 2400px. Original files are not retained. No PDFs/SVG/animated images or remote image URLs.
- Tesseract.js uses locally packaged Arabic/English language models; no CDN or OCR SaaS. Only confidence/character counts and image dimensions/contrast are retained. Recognition has a 25-second deadline and worker termination; processing is one upload per application instance, plus four persisted attempts per subject/day before expensive work. Failed/unavailable OCR is clearly recorded and **never approves a request**. Cold-start worker initialization is not independently timeboxed; platform request limits remain relevant. Load testing and production memory/timeout validation remain release gates.
- Backend-only, independent intake/review tokens, HTTPS, bounded bodies, private/no-store responses, attachment/sandbox headers, no public R2 URLs, no token/PII logs. R2 default encryption is not a claim of operator-exclusive/end-to-end encryption. Keep bucket public access/custom-domain access disabled.
- D1 partial unique index prevents concurrent open requests. A persisted key manifest precedes R2 writes; failed partial writes remain discoverable for cleanup. Requests are never visible to another subject. Only pending, unexpired documents are available to reviewers. Uploading requests cannot be withdrawn mid-write (409); this prevents deleting the manifest before upload completion.
- `/identity-review` + `/api/identity/review`: server-side immutable reviewer UUID allowlist, verified session/email, separate review token, explicit enable flag, current-password recheck per action, persisted 60 attempts/reviewer/hour, access/decision auditing, compare-and-set decisions and no self-approval. No extracted text, photos or password in localStorage. Browser preview is a temporary Blob URL revoked on close/unmount. Implement an approved reviewer Access/MFA perimeter **before enabling review**; the flag is an operator attestation, not automatic enforcement/verification of that perimeter.
- Delete/withdraw marks the request withdrawn before removing files, preventing concurrent approval. Retries are safe. A Worker hourly cron removes expired image objects, clears keys and logs purge; pending requests become `resubmit`. R2 deletion failure retains the key manifest for retry. Deletion is scheduled, not an exact-time guarantee. Monitor cron failures, stale uploading records and backlog; stale upload failures may remain until their retention deadline.
- Image deletion does not remove minimal request/audit records. Approvals mean human document review only and do not activate services. Operator must approve and implement separate metadata/audit retention and account-deletion handling before enabling collection.

## Provisioning (owner's authorized Cloudflare account only)

Use an authenticated local Cloudflare CLI/session or secret manager. Never paste API tokens or identity images into chat, Git, CI logs or PR comments. These commands are instructions, **not executed provisioning**:

```sh
# From cloudflare/identity, using a supported Wrangler version:
npx wrangler login
npx wrangler r2 bucket create sirocash-identity-private
npx wrangler d1 create sirocash-identity
# Put the returned database ID into wrangler.jsonc (the committed value is a placeholder).
npx wrangler d1 migrations apply sirocash-identity --remote
npx wrangler secret put IDENTITY_SERVICE_TOKEN
npx wrangler secret put IDENTITY_REVIEW_TOKEN
npx wrangler deploy
```

Generate independent random tokens (32+ characters) locally; set matching intake/review tokens in the independent **SiroCash** application project's server secrets, together with the HTTPS Worker origin and a separate stable `IDENTITY_SUBJECT_SECRET`. Never rotate the pseudonym key without an explicit subject-mapping migration. No need for account-wide Cloudflare API credentials in Next.js. Do not modify the two protected Vercel projects.

Before enabling `IDENTITY_COLLECTION_ENABLED=true`:
1. Owner approves jurisdictions, operator identity, purpose/lawful basis, transfer/data residency requirements, privacy notice/contact, document retention (1–90 days) and separate metadata/audit retention/deletion procedures. No default period is invented.
2. Configure `IDENTITY_RETENTION_DAYS`, private bucket bindings and both Worker secrets. Confirm R2 has no public access or public domain.
3. Protect reviewer access with an approved Access/MFA perimeter; set `IDENTITY_REVIEWER_IDS` to authorized account UUIDs. Only then enable `IDENTITY_REVIEW_ENABLED=true`.
4. Run synthetic end-to-end testing against deployed resources: session/authorization, two simultaneous uploads, review and self-review rejection, image access, token rotation, partial storage failures, withdrawal and retention. Test backup/deletion policy and jurisdiction requirements. Verify cron execution and alerting. Real hosted-account/inbox/hardware/provider operation is not established by local tests.
5. Deploy Next with traced local OCR models; verify deployed function size, OCR memory, cold-start and max duration. No document telemetry or error-body logging. Review third-party access and incident response.

## Local validation

`npm run test:identity` uses **real local Miniflare D1/R2 bindings**, synthetic generated images and actual local Arabic/English OCR. It covers disabled/invalid config, bounded bodies, origin enforcement, metadata stripping, unsupported image rejection, no initial upload before availability, owner isolation, private audited reviewer access, no automatic/self approval, immutable terminal decision, duplicate-open rejection (including concurrent requests), partial R2 failure manifest/cleanup, withdrawal, persisted quotas and scheduled purge. Browser component fixtures additionally cover Arabic/English at 390/1440px, disabled intake, file/consent requirements, pending state, withdrawal while collection is disabled, reviewer password clearing and Blob URL revocation. These are not hosted-account or Cloudflare-production tests. `npm test` includes it. No credentials or real documents are required. Test data is in ephemeral in-memory/emulator storage only.
