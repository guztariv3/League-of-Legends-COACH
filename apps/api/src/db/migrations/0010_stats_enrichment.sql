-- Idempotency ledger for the five new observation categories.
CREATE TABLE stats_enrichments (
  match_id text PRIMARY KEY REFERENCES stats_matches(match_id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('complete', 'legacy_unknown')),
  processed_at timestamptz NOT NULL DEFAULT now()
);
-- If a patch already has new-category counters, their per-match provenance cannot be
-- reconstructed. Conservatively block historical enrichment for that patch.
INSERT INTO stats_enrichments (match_id, status)
SELECT m.match_id, 'legacy_unknown' FROM stats_matches m
WHERE m.counted AND EXISTS (
  SELECT 1 FROM stats_counts c WHERE c.patch = m.patch AND c.kind IN
  ('matchup_first_item','matchup_core','rune_page','matchup_rune_page','matchup_spells')
);
