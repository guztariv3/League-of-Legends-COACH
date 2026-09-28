-- Run ONLY in an existing, authorized PostgreSQL SQL console for the intended environment.
-- No credentials, player identities, raw matches or user tables are read.
-- Replace 16.19 in both filters when evaluating another patch.
-- Counters and retained match ids have different retention rules: totals need not agree.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- Recent processing by source platform; processed_at is not the match's play time.
SELECT patch, platform, counted, count(*) AS retained_matches,
       min(processed_at) AS earliest_retained_processing,
       max(processed_at) AS latest_retained_processing
FROM stats_matches
WHERE patch = '16.19'
GROUP BY patch, platform, counted
ORDER BY platform, counted;

-- Full aggregate evidence by champion / role / opponent (encoded in scoped keys).
-- Include small samples and all kinds so missing new categories cannot be hidden.
-- key is an item/page/opponent identifier, NOT a credential.
SELECT patch, champion, position, kind, key, games, wins,
       CASE WHEN games > 0 THEN round(100.0 * wins / games, 2) ELSE NULL END AS observed_win_percent,
       CASE WHEN minute_n > 0 THEN minute_sum / minute_n ELSE NULL END AS average_purchase_minute
FROM stats_counts
WHERE patch = '16.19'
ORDER BY champion, position, kind, games DESC, key;

ROLLBACK;
