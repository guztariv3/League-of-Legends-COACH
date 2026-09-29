-- Aggregate-only export. Run in the existing authorized PostgreSQL console.
-- No migrations, writes, player identities or credentials. Change both patch literals together.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
  'schemaVersion', 1,
  'patch', '16.19',
  'complete', true,
  'generatedAt', CURRENT_TIMESTAMP,
  'source', 'existing_database_counters',
  'rows', COALESCE(json_agg(row_to_json(counts)), '[]'::json)
) AS audit_export
FROM (
  SELECT patch, champion, position, kind, key, games, wins
  FROM stats_counts WHERE patch = '16.19'
  ORDER BY champion, position, kind, key
) counts;
ROLLBACK;
