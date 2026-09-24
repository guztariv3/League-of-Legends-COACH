CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE riot_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puuid text NOT NULL,
  game_name text NOT NULL,
  tag_line text NOT NULL,
  platform text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  include_in_profile boolean NOT NULL DEFAULT true,
  source text NOT NULL,
  sync_status text NOT NULL DEFAULT 'never',
  sync_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX riot_accounts_user_puuid ON riot_accounts (user_id, puuid);

CREATE TABLE raw_matches (
  match_id text PRIMARY KEY,
  platform text NOT NULL,
  source text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE raw_timelines (
  match_id text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE account_matches (
  account_id uuid NOT NULL REFERENCES riot_accounts(id) ON DELETE CASCADE,
  match_id text NOT NULL REFERENCES raw_matches(match_id),
  started_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, match_id)
);
CREATE INDEX account_matches_started ON account_matches (account_id, started_at DESC);

CREATE TABLE match_analyses (
  match_id text NOT NULL REFERENCES raw_matches(match_id),
  puuid text NOT NULL,
  analysis_version integer NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, puuid, analysis_version)
);

CREATE TABLE knowledge_bundles (
  version text PRIMARY KEY,
  source text NOT NULL,
  status text NOT NULL,
  errors jsonb NOT NULL DEFAULT '[]',
  payload jsonb NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL
);
