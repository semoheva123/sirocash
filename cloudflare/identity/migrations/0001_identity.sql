CREATE TABLE identity_requests (
 id TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('national_id','passport','residence_permit')),
 status TEXT NOT NULL CHECK(status IN ('uploading','pending_review','approved','resubmit','withdrawn','failed')),
 front_key TEXT,
 back_key TEXT,
 checks TEXT NOT NULL,
 consent_version TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 reviewed_at INTEGER,
 reviewer TEXT,
 reason TEXT CHECK(reason IS NULL OR reason IN ('unreadable','incomplete','unsupported','details_mismatch')),
 decision_id TEXT,
 purged_at INTEGER
);
CREATE UNIQUE INDEX identity_one_open ON identity_requests(subject) WHERE status IN ('uploading','pending_review');
CREATE INDEX identity_subject ON identity_requests(subject,created_at DESC);
CREATE INDEX identity_retention ON identity_requests(expires_at) WHERE purged_at IS NULL;
CREATE TABLE identity_quota (subject TEXT NOT NULL, day TEXT NOT NULL, attempts INTEGER NOT NULL, PRIMARY KEY(subject,day));
CREATE TABLE identity_audit (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX identity_audit_request ON identity_audit(request_id,created_at);
