-- Revocable GitHub OAuth administrator sessions.
-- The database stores only SHA-256 of opaque cookies, never GitHub tokens.
CREATE TABLE IF NOT EXISTS admin_sessions (
  session_hash TEXT PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  github_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
