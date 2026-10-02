ALTER TABLE users ADD COLUMN dev_login_token_hash text;
-- Existing identities remain unclaimed until an authenticated owner binds a token.
CREATE UNIQUE INDEX users_claimed_dev_name ON users(display_name)
  WHERE dev_login_token_hash IS NOT NULL AND password_hash IS NULL;
