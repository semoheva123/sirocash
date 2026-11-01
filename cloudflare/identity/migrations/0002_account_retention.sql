-- Closed-account cleanup is separate from time-based document expiry.
CREATE TABLE identity_closed_accounts (subject TEXT PRIMARY KEY, closed_at INTEGER NOT NULL);
