# Production readiness: implementation vs release gates

This is an engineering checklist, not a certification, legal opinion, financial-service authorization, or proof of independent audit. Real financial services remain OFF. Do not collect deposits, custody keys, identity documents or actual funds before all mandatory gates below have evidence and an accountable owner.

## Implemented in this release

- Recovery through verified registered email, domain-separated HMAC code, ten-minute TTL, five guesses, resend replacement, durable email/global quotas, generic public response for known/unknown/suppressed requests. Timing floor reduces simple fast-path disclosure but does NOT prove constant-time network/provider behavior. Infrastructure IP/bot limits remain required.
- Dual-email changes: current password + live bound session + current-email approval + new-email approval. Same-password/email snapshot checked on final commit. Unique-email race fails closed. All sessions/sign-in/change/recovery challenges revoked on credential/email change.
- Session inventory with non-bearer management IDs, explicitly untrusted coarse user-agent labels, nullable metadata for older sessions, single/other/all revocation with server ownership checks. No location/IP claims or hardware-identity guarantee. Hardware passkey enrollment management is still separate/not implemented for real financial services.
- Append-only runtime audit events; notification outbox committed atomically with each security change. Email failures do not undo successful credential changes. Idempotency key per notification, atomic claim with SKIP LOCKED, max five tries, 15-minute re-eligibility. Provider acceptance is shown as sent, not inbox receipt.
- Read-only operations page, deny-by-default explicit `OPERATIONS_ADMIN_IDS` UUID allowlist, server session requirement, audit on view, aggregate counts only. No user/financial editing or money-moving admin tools. No admin account is automatically designated.
- Honest public status/help/experimental terms/privacy descriptions. These are not final lawyer-approved policies and do not identify an invented licensed operator.
- Offline normalized-export reconciliation tool (`npm run ops:reconcile -- /secure/path/report.json`): exact integer micro-units, flags missing/duplicate/amount/asset/network mismatches, nonzero exit on mismatch, no automatic ledger adjustment, no customer references printed to logs. This does not connect to a real provider or prove settlement.

## Mandatory external decisions / evidence (BLOCKED, not done)

| Gate | Required owner/input | Evidence needed |
| --- | --- | --- |
| Legal operator / permitted markets | Business owner + qualified legal counsel | Registered operator details, supported jurisdictions, assessed licenses/KYC/AML/sanctions obligations, approved service terms and privacy/retention/rights process |
| Domain and official mail | Owner-controlled domain / DNS access | Domain ownership, verified sender DKIM/SPF/DMARC, working support inbox, tested delivery/recovery to independent addresses. Trial sender currently restricts recipients. |
| Financial provider | Owner-selected contracted provider per service | Sandbox+production accounts, official API/webhook docs, secret storage, permitted countries, fees/limits/refunds/SLAs and settlement exports |
| Custody architecture | Approved custody/provider model | Key control and rotation, segregation of duties, audited signing approval, cold/hot policy if applicable, recovery/disaster tests. No custody claim before this. |
| Independent security review | Independent qualified reviewer | Findings, remediation and retest report; internal tests do not substitute for this |
| Backups / continuity | Infrastructure owner | Actual scheduled encrypted backups or PITR entitlement, isolated restore drill, measured RPO/RTO and reconciliation after restore. No restore drill has been run against production. |
| Monitoring / incident response | On-call owner + destination | Alert receiver, uptime/error/queue checks, tested paging, redaction, response runbook and escalation contacts |
| Operational capacity | Owner + deployment plan | Cron/email limits, concurrency/load-test results, capacity and spend limits, documented service-level objectives |

## Safe provider implementation sequence

Choose ONE real service first. Obtain official sandbox docs before writing a provider adapter. Keep disabled until:
1. Server-authoritative quote lists currency/network/fees/limits/expiry and exact atomic amount; never trust browser amount/fees or floating point.
2. Immutable intent + client idempotency key scoped to actor; same key/different payload rejected. Durable attempt state and provider idempotency/retry rules. Unique external reference and signed webhook verification over raw payload.
3. Validated device/user approval bound to the exact intent; no transferable or replayable approval.
4. Confirmed provider states mapped through a tested state machine; out-of-order/duplicate/forged notifications cannot debit twice. Failed/uncertain provider results are investigated, not blindly retried as new payments.
5. Double-entry postings and cached balance updates in one transaction, with insufficient-balance and concurrency checks; corrections use compensating entries, never edit historical entries.
6. Sandbox end-to-end tests for success, failure, timeout, delayed/duplicate webhook, crash/restart, refund, reversal and reconciliation mismatch; controlled production pilot only after sign-off.

## Configuration (do not paste secrets into chat or Git)

- `SUPPORT_EMAIL`: only an inbox approved by the owner. Unset shows an honest unconfigured notice.
- `OPERATIONS_ADMIN_IDS`: comma-separated existing immutable account UUIDs approved for read-only operations. Unset grants nobody. Do not use email wildcard rules or give financial privileges to the web runtime.
- `CRON_SECRET`: at least 32 random characters for the notification retry endpoint `/api/internal/security-notifications`. Provision as a sensitive production variable. Endpoint denies use if unset. The scheduled job uses Bearer authentication. Never use a browser session or public URL token as job authentication.
- Notification attempts also run after successful security actions. The optional daily schedule is a safety net, not real-time email SLA; free deployment/provider plans are not a guarantee of timely retries or inbox delivery. Production requires an approved higher-frequency worker/queue and monitoring.
- Existing TLS CA verification, restricted database role and secret-store rules remain required. Never disable certificate checks for a deployment.

## Normalized reconciliation export

Local JSON shape: `{ "ledger": [{ "reference": "provider-reference", "asset": "USDT", "network": "TRC20", "amountMicros": "1000000" }], "provider": [ ...same canonical fields... ] }`.
Exports must use the same reconciliation window, final-settled status, sign convention, fee treatment and native asset units. Never compare a provider gross amount to a ledger net amount. The tool validates matching normalized rows, not the correctness of the exporter or completeness of an upstream data source. Keep real exports outside Git under restricted storage.
