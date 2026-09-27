-- Phase 4: statistics from recent Master+ ranked games (Riot match-v5), aggregated per patch,
-- champion and position. Only counters are kept: never the games themselves or the players.
CREATE TABLE stats_matches (
  match_id text PRIMARY KEY,
  platform text NOT NULL,
  patch text NOT NULL,
  counted boolean NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stats_counts (
  patch text NOT NULL,
  champion text NOT NULL,
  position text NOT NULL,
  kind text NOT NULL,
  key text NOT NULL,
  games integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  -- Sum of the minute each game reached this (first items: when it was completed), for averages.
  minute_sum double precision NOT NULL DEFAULT 0,
  minute_n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (patch, champion, position, kind, key)
);
CREATE INDEX stats_counts_lookup ON stats_counts (champion, position, patch);
