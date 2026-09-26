-- Rank and LP after each sync (Riot keeps no history, so we record it ourselves).
-- A row is added only when something changed; rows go with the account.
CREATE TABLE rank_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES riot_accounts(id) ON DELETE CASCADE,
  queue_type text NOT NULL,
  tier text NOT NULL,
  rank text NOT NULL,
  lp integer NOT NULL,
  wins integer NOT NULL,
  losses integer NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rank_snapshots_account ON rank_snapshots (account_id, queue_type, taken_at);
