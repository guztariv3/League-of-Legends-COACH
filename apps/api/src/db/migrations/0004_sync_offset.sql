-- Lets an incremental sync resume a truncated backlog scan instead of losing it.
-- lastSyncedAt is now the sync's own start time, not completion time, so games
-- played while a sync is running are never skipped by the next sync's lower bound.
ALTER TABLE riot_accounts ADD COLUMN sync_offset integer NOT NULL DEFAULT 0;
