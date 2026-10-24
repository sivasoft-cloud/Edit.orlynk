-- Edit.or.lynk licensing schema.
--
-- The Worker also creates these tables on first request (CREATE TABLE IF NOT
-- EXISTS), so a fresh D1 database needs no manual step. This file exists so the
-- schema is reviewable and can be applied by hand if you prefer:
--
--   wrangler d1 execute <database-name> --remote --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  key_plain TEXT UNIQUE NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'pro',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at INTEGER NOT NULL,
  redemption_limit INTEGER NOT NULL DEFAULT 1,
  redemptions INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS activations (
  key_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (key_id, device_id)
);

CREATE TABLE IF NOT EXISTS campaign_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_dm',
  key_id TEXT,
  instagram_scoped_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  subject TEXT,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses (status);
CREATE INDEX IF NOT EXISTS idx_sessions_code ON campaign_sessions (code);
