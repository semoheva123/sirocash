CREATE TABLE identity_analysis (
 request_id TEXT PRIMARY KEY REFERENCES identity_requests(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('queued','processing','preliminary_pass','resubmit','inconclusive','unavailable')),
 result TEXT NOT NULL DEFAULT '{}',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE identity_ai_daily (
 day TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 10)
);
