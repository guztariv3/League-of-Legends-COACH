-- A bounded scan keeps the same upper time bound across retries and capped passes.
ALTER TABLE riot_accounts ADD COLUMN sync_offset integer NOT NULL DEFAULT 0 CHECK (sync_offset >= 0);
ALTER TABLE riot_accounts ADD COLUMN sync_window_end timestamptz;
