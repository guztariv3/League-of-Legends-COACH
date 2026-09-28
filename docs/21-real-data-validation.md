# Real-data collection and role coverage

The engine audit (docs/20) is not match evidence. No live Riot key or production database was available in the development environment for this work. No real coverage figures or build optimality are claimed.

## Existing collection

The API already starts its Master+ solo-queue crawler when RIOT_API_KEY is configured and STATS_CRAWL is not 0. No new provider or dependency is needed. Configure the key privately in the environment where the API runs; never paste it into chat, commit it or include it in reports. A key stored in Render is not automatically available to a Windows test server or this workspace.

Use the matching PR branch and the existing test server. In its PowerShell window, after configuring RIOT_API_KEY privately:

```powershell
$env:STATS_CRAWL="1"
$env:STATS_PLATFORMS="EUW1,KR,NA1"
$env:STATS_INTERVAL_MS="3000"
pnpm --filter @coach/api start
```

Keep any existing WEB_DIST/PORT configuration. Startup should show data=riot and stats enabled. This only proves configuration; API errors, expired credentials or inadequate samples may still prevent useful observations. Do not change production configuration merely to run this test. Do not set DATABASE_URL to production on a test PC.

The collector walks Challenger/Grandmaster/Master ladders and recent ranked matches. It is not an exhaustive, representative census of all ranks or matchups. Do not interpret absent off-role samples as evidence that a champion cannot play that role. Collection duration cannot guarantee enough games for rare roles or opponents.

## Read the actual coverage

After collecting, stop the local API with Ctrl+C before opening its embedded PGlite database. From the repository root, run the following, replacing 16.19 with the patch actually used by the server:

```powershell
pnpm --silent --filter @coach/api stats:coverage 16.19 > stats-coverage.json
```

The command reads the API's existing DATABASE_URL or PGLITE_DIR (default apps/api/.data/pglite under pnpm --filter). It does not run migrations, start collection or reset counters. PostgreSQL queries use a read-only transaction. Embedded PGlite needs exclusive access and may perform normal storage maintenance when opened. A missing database is an error, not a fabricated zero-coverage report.

The report contains aggregate counters only, with no player identities, keys, account credentials or database URL. Review it and attach stats-coverage.json for assessment. The roster version is recorded separately from the requested patch: update the catalog if a newer patch adds champions. The database's provenance must be checked separately: counters alone cannot certify real Riot input rather than imported or test data.

Each champion × position row reports total games, first-completed-item, full rune-page and spell-pair sample availability. Observed opponents have separate scoped rows; absent opponents have no recorded scoped options. Thresholds follow the current evidence pipeline: displayed options need 8 observations, supported options need 30, and their visible pool needs 100. These are sample gates, not proof of legality, strategic quality or a causal win-rate advantage. Core purchase prefixes, item legality and full rune-page legality require further validation; this report does not certify them. Every row retains optimalityVerified=false.

## Known gaps to assess before declaring completion

- Older counted matches are immutable and are not backfilled with the newly added full rune-page/matchup counters. Collect new matches; do not delete shared counters or re-add old matches to force numbers upward.
- Before the crawler repair, a null timeline could permanently claim a game without purchase observations. The repair leaves missing matches/timelines unclaimed so subsequent history listings can retry them. It does not repair older counters or promise when the match will reappear. Permanently unavailable matches can remain absent; inspect category coverage rather than treating total games as proof of purchase coverage.
- The collector can retain the previous patch for display, but this report and recommendation evidence use the requested exact patch only.
- Compare actual recommended choices against supported samples by champion/role/opponent and examine exceptions. A larger win rate alone does not establish the best first item: completion bias and player selection matter.
- Windows/League gameplay validation is still required independently of statistical coverage.

## Crawler diagnostics (requires deploying this revision)

`[stats] progress` emits an initial process-local summary and then at most one per minute while steps complete. `steps` counts outcomes since this process started, not lifetime database matches. `players` and `queued` are aggregate sizes. `counted` means this worker completed eligible aggregation; concurrent workers may have claimed the same match first, so use database counters for authoritative totals. `unavailable` means match or timeline data was absent and not permanently claimed. `no-patch` means game facts are unavailable. `failed-auth`, `failed-rate_limited`, `failed-schema`, `failed-server`, and other Riot error categories distinguish causes without logging raw exception text, secrets, player identities, URLs or match ids. Other exceptions appear as `failed`. A stalled request may delay the summary: it is not an independent health heartbeat.

Empty ladders are retried after a minute instead of on every tick. Nonempty ladders keep the player cursor across six-hour refreshes to reduce repeatedly starting at the highest-ranked players. Sampling still remains selective. No collector speed increase, credential change, migration or production deployment is included.
