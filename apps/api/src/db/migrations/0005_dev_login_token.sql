-- Closes dev-login impersonation: reusing a display name now requires the
-- client-held token claimed the first time that name was used (hash only, never the raw token).
ALTER TABLE users ADD COLUMN dev_login_token_hash text;
