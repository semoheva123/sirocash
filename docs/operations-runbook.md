# Operational runbook (requires named owners before real-money release)

## Health and alerting
- Poll `/api/health/database`; only `ready`/200 is healthy. Do not expose raw database errors, credentials or customer details in alerts.
- Review authenticated `/operations` with explicitly approved admin UUIDs. Counts are security/session/mail telemetry, not financial solvency or settlement evidence.
- Alert on queue growth, max-attempt mail failures, unusual recovery/sign-in request volume, repeated 503s, and database/TLS failures. No alert destination or on-call person is assumed to exist yet.
- Configure and test authenticated notification retry job; provider acceptance does not prove inbox delivery. Trial recipient restrictions must be removed by verifying an owned sender domain.

## Suspected account compromise
1. Account owner ends other/all sessions and changes password using email approval, or uses recovery if locked out.
2. Review append-only security events; never request a code/password from the user. Session device labels are self-reported, not proof of identity/location.
3. If infrastructure secrets may be exposed, use provider-managed rotation/revocation, deploy the rotated configuration and verify health. Do not copy secrets into issue trackers.
4. Preserve minimal authorized evidence and follow the legally approved incident/notification process. No production customer or money data should be created for testing.

## Database failure / bad deployment
- Fail closed. Never replace a failed account load with guest demo balances, enable a financial service to bypass an outage, replay previously applied migrations, or disable TLS.
- Identify exact deployment SHA and schema compatibility before rolling application code back. New additive tables/columns are compatible with older code, but new-column grants need reassessment if reverting email-change functionality.
- Restore only into an isolated database first. Verify ledger balance constraints, immutable history, unique idempotency/external references, account isolation, runtime-role privileges and pending provider attempts before any production recovery.
- A test procedure is not a completed backup/restore drill. Require actual retained evidence and sign-off.

## Load / integration testing
- Use a separate authorized staging project and synthetic accounts/data, with email/provider adapters stubbed or sandboxed.
- Agree request rates and spend limits; do not run a destructive or high-volume test against production or send hundreds of real OTP emails.
- Test concurrent payment intent/retry/webhook behavior only after a real provider contract is implemented. Current financial services remain disabled.
