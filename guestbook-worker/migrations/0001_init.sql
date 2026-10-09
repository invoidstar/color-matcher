-- Color Matcher-only guestbook. Timestamps are Unix seconds (UTC).
-- Apply with Wrangler migrations, not by pasting an incompatible legacy schema.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 96),
  category TEXT NOT NULL CHECK (category IN ('experience', 'bug', 'feature', 'other')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  admin_reply TEXT,
  fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  replied_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_status_created
  ON messages(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_fingerprint_created
  ON messages(fingerprint, created_at DESC);
