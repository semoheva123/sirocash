# D1-only private identity storage

## Selected design

Owner changed the identity store to **Cloudflare D1 only**. Normalized document JPEG copies and request/review metadata now live in the same isolated D1 database. No R2 account activation, bucket, S3 key, object-storage subscription or R2 binding is required or called by provisioning. Primary accounts/wallet/ledger remain in PostgreSQL; this is not a migration of the whole financial platform into D1.

Confirmed project database: `sirocash-identity`, `12a1811a-31fe-47c9-9e93-2ac86e7599a4`, account `54cf1f9f742ce2f8b674b2c3fa2cee51`. Migrations 0001/0002 were already applied; 0003 creates private document BLOB rows. Migration checksums are journaled, unchanged migrations are not replayed and untracked schemas/unrelated Worker bindings are not overwritten. Only this project's resources are touched.

## Capacity and storage

Cloudflare's published D1 limits: Free **500 MB per database**, **5 GB total per account**, and **2,000,000 bytes per BLOB/row**. The 5 GB total is NOT 5 GB for this database. Tables, indexes and documents share the allowance. See https://developers.cloudflare.com/d1/platform/limits/ . These are limits, not an unlimited-free-storage promise or a commitment that every Cloudflare account has the same activated plan.

- JPEG/PNG intake remains limited to 1.5 MB per image, 3.2 MB per bounded multipart request, 12M decoded pixels and >=600px per side. Sharp normalizes <=2400px JPEG copies and strips EXIF/location. No PDF/SVG/animated input or remote URLs. Original files are not retained.
- Copies are parameter-bound binary BLOBs, **not Base64**, with per-image SHA-256 integrity checks, strict size/type constraints and a cascading request foreign key. Front/back images, pending-review transition and submission audit commit in one D1 batch transaction. Failed second-image insertion rolls back the first.
- Document bytes are never included in status/list APIs. Only authorized reviewed access reads the BLOB; digest mismatch refuses delivery. Read/delete paths do not need an R2 service binding.
- Free Workers' D1 query budget is respected with bounded cleanup: at most 5 document-request purges and 3 closed-account finalizations per invocation, and at most 4 new closure marks per reconcile call (<=48 D1 statements in the worst combined branch). The application repeats reconciliation in bounded invocations; unfinished backlog fails closed and needs monitoring. No automatic paid upgrade or silent database sharding.
- At 3 MB of image copies per account, 500 MB holds fewer than 167 such accounts after metadata/index overhead. Real normalized sizes vary; capacity monitoring/limits are needed before growth. Storage-full responses do not authorize fallback to shared/public storage.
- D1 platform encryption is not operator-exclusive/end-to-end encryption. Deleting live rows is not a promise of instant erasure from provider point-in-time recovery/backups; those follow provider retention and must be included in the approved privacy/rights procedure.

## Retention and consent

Consent is now versioned for D1 (`identity-v3-d1`, `identity-v3-d1-account-lifetime`); stale R2-era upload consent is rejected. Existing records never have their retention extended silently.

Owner selected **account-lifetime retention**: copies/review records remain while the account is registered and not closed, with no fixed expiry. Inactivity or session expiry is not closure and does not indicate biological life/death. APIs return `expiresAt:null`, not a fictitious far-future date. Early document withdrawal remains available; it does not itself delete the primary account or all review records.

The authenticated daily `/api/internal/identity-lifecycle` obtains a complete primary-account snapshot, HMAC-pseudonymizes account UUIDs and reconciles private D1. Failed/truncated/oversized (>10,000 accounts)/stale snapshots do not cause deletion. A 10-minute creation grace window protects newly registered accounts and in-flight writes. Confirmed absent accounts are marked closed; BLOBs are deleted with retry; identity request/audit/quota records are removed afterwards; retained reviewer references in other accounts' records are de-identified. No primary-account/ledger deletion is performed here. Customer self-service primary-account closure is not yet implemented.

Collection requires explicit enablement, configured lifecycle credentials and monitoring; it stays separate from review enablement and financial activation. Scheduled cleanup is not an exact-time deletion SLA. A backlog, database limit or failed job must be monitored rather than treated as successful erasure.

## Security and bootstrap

- Database-verified session/email, same-origin intake, versioned consent and stable HMAC pseudonyms. No original filenames, identity numbers or raw OCR text in metadata/logs.
- Tesseract.js runs packaged Arabic/English models on the application server, not OCR SaaS/CDN. Only aggregate confidence/character counts and image contrast/dimensions are stored. Four persisted upload attempts/user/day, synchronous per-instance OCR gate, 25-second recognition deadline and worker termination. Hosted cold-start/memory/load validation remains necessary.
- Independent intake/review service credentials, private/no-store responses, attachment/sandbox headers, no public document URLs, access auditing, explicit reviewer UUID allowlist and current-password check for every staff action. No self/automatic approval. Reviewer access perimeter/MFA must be approved before review enablement. Browser Blob previews are revoked on close/unmount.
- OCR is not authenticity/ownership/liveness verification, face matching, certified KYC or sanctions screening. No separate selfie/biometric template is collected; document approval does not activate finance.
- The account deployment token remains only in GitHub Actions secrets and is never copied into the application. On first gateway bootstrap, independent random service/subject/cron secrets are generated, masked, and handed off using RSA-OAEP + AES-256-GCM to an ephemeral workspace private key. Only the public key/ciphertext may enter GitHub; decrypted material stays outside Git in ignored local cache and the intended application secret store. Existing service secrets are preserved and never implicitly rotated. Loss of an unfinished handoff requires an explicit recovery/rotation procedure, especially before any real documents are collected.
- Deployed synthetic checks use an original test JPEG, random test-only subjects, owner isolation, private byte-for-byte document reads, self-approval denial, manual decision and withdrawal. Cleanup is restricted to that freshly generated subject. No real identity or customer session is used.

## Hosted deployment preflight

`IDENTITY_DEPLOYMENT_CHECK=true` runs `npm run identity:deployment-check` before the Next build. This uses the intended production application secrets (never the Cloudflare deployment token), the same lifecycle route handler and its authenticated/unauthenticated checks, actual complete primary-account reconciliation, hosted local image normalization/OCR, synthetic D1 upload/private byte comparison, isolation, self-approval denial, synthetic review and withdrawal/deletion-state verification. It creates no primary account, emits no OCR text or response bodies, and cleans up only its random synthetic subject. Failure blocks the deployment. Collection-enabled builds refuse to skip this check. This does not replace browser/session, cold-start/load, reviewer/perimeter or legal review. Keep review disabled until explicitly assigned and secured.

## Activation boundaries

After deployment, configure matching production application secrets/origin, account-lifetime policy and the protected lifecycle scheduler; confirm the deployed scheduler completes. Do not enable collection/review merely because a Worker URL exists. Reviewer IDs, perimeter, operator/rights contact, legal basis/jurisdictions, backup/deletion procedures and capacity monitoring still require approval. No passwords/keys/real documents should be pasted in chat, CI logs or artifacts.

`npm test` includes real local D1 emulation **without any R2 binding**, actual local OCR, binary round-trip (including a 1,499,000-byte BLOB), digest corruption refusal, transactional rollback, owner isolation, audited staff access, quotas, concurrent-request rejection, withdrawal, legacy expiry, lifetime non-expiry and safe closure reconciliation. These do not substitute for real hosted account/inbox/hardware or independent compliance/security review.

## Cloudflare Workers AI preliminary analysis

New opt-in v4 requests may use `@cf/meta/llama-4-scout-17b-16e-instruct` through the private Worker's AI binding. The application flag is `IDENTITY_AI_ENABLED=true`. Existing v2/v3 records are never analyzed retroactively. AI consent explicitly covers cloud image processing, not merely D1 storage. Inference location is not presumed to equal D1 storage location; Cloudflare terms/data-processing policies and the model license require operator review.

The upload transaction queues one analysis record atomically with the image BLOBs. A conditional queued-to-processing claim prevents duplicate inference. Images are integrity-checked and supplied inline; no public document URLs, external tools or AI Gateway logging are configured. A strict allowlisted JSON schema drops raw model text, extracted dates and MRZ lines after computing summary flags. No extracted names or document numbers are persisted. Passport TD3 check digits/composite checks and expiry/MRZ agreement are deterministic; TD1/TD2 and unknown fields remain inconclusive rather than guessed. Checksums are not evidence of authenticity.

Results are separate from identity approval: processing, preliminary_pass, resubmit, inconclusive or unavailable. No AI result updates an account's verification, request approval, ledger, permissions or financial eligibility. Prompt injection in images is untrusted; the model has no action/tool privileges. Late results cannot update withdrawn, purged or manually decided requests. Account/request deletion cascades the analysis row; early withdrawal retains only limited diagnostic/audit metadata, not image copies.

The initial hard application cap is **10 inference attempts per UTC day across all accounts**, additionally constrained by Cloudflare's free daily neuron allowance and per-account upload quotas. There are no automatic inference retries, billing changes or paid-plan upgrades. Provider failures/timeouts/limits produce unavailable, never a positive result. Polling is read-only and stale processing becomes unavailable after two minutes. Users may withdraw/delete and resubmit; the service does not silently rerun an old document.

The production preflight must submit only the synthetic NOT AN ID DOCUMENT fixture and require the live model to request resubmission for document type. Stubbed tests cover schema rejection, no PII persistence, MRZ/date checks, fresh consent, isolation, single-run claiming, global budget, provider failure, withdrawal races, cascade cleanup and absence of automatic approval. Live-model success is not an authenticity benchmark, independent audit, proof of Arabic/English accuracy across countries or a cold-start/load test.

## Reactivation hardening — 2026-11-05

Owner explicitly authorized reactivation and separately approved adding document-review authority to the existing support administrator. Reviewer assignment remains a production-only immutable UUID environment allowlist, not a public email-based bypass. Before enabling collection/review, the production preflight requires every configured reviewer to have a verified account and an existing passkey bound to the production RP domain.

Every list, document read and human decision now requires the current password **and** a fresh, single-use, action-bound WebAuthn approval. Review digests bind action, request UUID, document side, decision, reason and human confirmation in a distinct domain; they cannot authorize payments. Approval consumption checks the live session and uses the existing private durable-passkey tables, with no migration or financial writes. The private D1 call follows committed consumption; an uncertain D1 result is never automatically retried. Unauthorized users cannot request a review authentication challenge. The client uses bounded transport, clears the password and requires a new device confirmation for each action.

Local validation: full test suite and build, actual D1 emulation/OCR, and restricted-role PostgreSQL approval consumption passed. Added cases reject changed review targets/sides/decisions, malformed commands, cross-session approval, replay and use of a review token as payment authority. WebAuthn cryptographic verification is mocked only in offline tests, not in the HTTP route. Production activation must additionally pass the existing synthetic hosted D1/OCR/lifecycle/live-AI preflight. No real identity upload or administrative decision is performed for deployment acceptance.

Document acceptance remains document review, not a claim of certified KYC, ownership or liveness. It does not update PostgreSQL `kycStatus`, payment capabilities, balances or withdrawal limits. AI remains preliminary only, with existing fresh-consent and ten-attempts/day caps. No credentials are rotated, no paid plan enabled, and no past documents are backfilled or reanalyzed.
