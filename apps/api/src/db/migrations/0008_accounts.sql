-- Own accounts (public site): a username and a password hash (scrypt) per user. Users created by
-- the development sign-in have neither until they set them in Settings.
ALTER TABLE users ADD COLUMN username text;
ALTER TABLE users ADD COLUMN password_hash text;
CREATE UNIQUE INDEX users_username ON users (username);
