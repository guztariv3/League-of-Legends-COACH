# All champion/role/opponent coverage

Scope: the active 16.19.1 catalog contains 173 champions. Every ordered champion × five canonical roles × opponent is enumerated: 149,645 rows. Of these, 865 are mirrors and 148,780 have different champions. The current collector processes ranked solo matches, which cannot supply mirror evidence. Opponent means the same-role counterpart; this does not enumerate complete enemy teams, cross-role swaps or every live inventory/state. Off-role entries are included without endorsing them.

## Current access and evidence

The public configuration endpoint returned `dataSource=riot`, `knowledgeVersion=16.19.1`. The champion statistics endpoint returned HTTP 401 unauthenticated. No authenticated statistics or production database was read. Therefore all current production sample statuses in the generated report are `not_verified`, not zero or `no_observations`. Older screenshot excerpts are partial and cannot be imported as a complete snapshot. Locke and Zaahen have incomplete detailed mechanics in the bundled catalog.

The report is an exhaustive *coverage matrix*, not proof of an exhaustive strategic review. `engineMatchupExecuted=false` and `optimalityVerified=false` make this explicit. The separate roster audit executes 865 representative champion/role scenarios, not every rival or possible game state.

## Reproduce

From apps/api, using the existing workspace dependencies:

```sh
node --import tsx ../../scripts/audit-matchups.ts --out /absolute/output
```

Without an input export, blank counts remain unknown. It writes all matchups, champion/role totals, supported matchup rows, observed core-prefix coverage and metadata. Empty supported/prefix files in unknown mode do NOT establish an absence of production data.

To read existing counters without changing them, the updated API CLI supports:

```sh
pnpm --silent --filter @coach/api stats:coverage 16.19 --raw > stats-export.json
```

This uses the existing database configuration and does not run migrations or start the crawler. Do not open a live PGlite database concurrently. PostgreSQL uses a read-only transaction. The raw schema requires exact patch, a complete export declaration, generation timestamp and unique validated counters. Credentials and player/user tables are excluded. An alternative for an existing authorized PostgreSQL console is `scripts/stats-matchups-export.sql`; save the single `audit_export` JSON field. Do not run it against an unintended database.

```sh
node --import tsx ../../scripts/audit-matchups.ts --input /absolute/stats-export.json --out /absolute/output
```

## Interpretation

- `sufficient_sample`: at least 100 observations in this category/scope and at least one option with 30 observations. This is a sample gate, not confidence that a build is optimal.
- `insufficient_sample`: positive observations below those gates.
- `no_observations`: absent in a validated complete snapshot.
- `not_verified`: no complete snapshot provided.
- `*_sample_scope=general_role` identifies broad role sample availability when matchup samples are inadequate. It is not matchup evidence. Engine use additionally depends on role totals, legal pages/spells, eligible items, mechanics and current inventory.
- Core samples are grouped by ordered observed purchase prefix and next item. A high global `core` total cannot validate every later slot. Arbitrarily rearranged held inventory is not counted as purchase chronology; the engine separately handles held-prefix matching.

Source provenance remains declared rather than independently certified. Report counts alone do not prove the data came from real Riot matches. Regional/rank splits are unavailable in these aggregated counters and are not invented.

Tests verify complete enumeration, mirror flags, unknown versus absent, role/opponent isolation, rare-option denominators, prefix grouping, and rejection of invalid, duplicated, partial or wrong-patch input. The report does not alter the runtime recommendation engine or deploy anything.

## Historical screenshot evidence (not a current full export)

User screenshots dated September 28 show the following general first-item counters. These meet or fail only the sample-count gate; no matchup or rune-page conclusions follow. Visible observations are sums of the five displayed item options, not a reconstructed complete dataset. They are kept separate from the current matrix and never fed to the recommender as full evidence.

| Champion/role | Reported role games | Visible first-item observations | Historical sample gate |
|---|---:|---:|---|
| Ahri MIDDLE | 808 | 793 | met |
| Yasuo TOP | 336 | 319 | met |
| Yasuo MIDDLE | 804 | 749 | met |
| Yasuo BOTTOM | 319 | 302 | met |
| Smolder BOTTOM | 80 | 74 | not met |

All four positive cases have a visible option with at least 30 games. Smolder's total role games were below 100. These are historical user-provided excerpts, not a fresh production query or a proof of optimal builds.

Local validation: 821 tests passed, one PostgreSQL-only case skipped; typecheck passed. The roster audit executed all 865 representative cases. The complete coverage matrix generated exactly 149,645 rows, including 865 mirrors. No complete-matchup strategic validation is claimed.
