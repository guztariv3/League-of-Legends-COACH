-- Desktop app pairing (decision: one-time code → revocable device token).
-- Only SHA-256 hashes of codes and tokens are stored.
CREATE TABLE device_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'App de escritorio',
  code_hash text UNIQUE,
  code_expires_at timestamptz,
  token_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX device_links_user ON device_links (user_id);
