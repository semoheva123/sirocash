-- Private normalized JPEG copies. Bound BLOBs, not Base64 strings or SQL literals.
-- 1.5 MB + metadata stays below D1's 2,000,000-byte row limit.
CREATE TABLE identity_documents (
 document_key TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES identity_requests(id) ON DELETE CASCADE,
 side TEXT NOT NULL CHECK(side IN ('front','back')),
 bytes BLOB NOT NULL CHECK(typeof(bytes)='blob' AND length(bytes) BETWEEN 100 AND 1500000),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 UNIQUE(request_id,side)
);
