# Live build review follow-up

Changes after the frozen Windows handoff in document 25. That installer's runtime does not include these changes until a new build is produced.

## Runtime corrections

- Purchase evidence remains eligible after the first completed legendary. The owned completed-item multiset must match the start of an observed purchase sequence; inventory slot order is not treated as purchase chronology. Subsequent proposed items must match the remainder in order. Boots and components are excluded from the completed-item prefix. Missing/sold prefix items do not silently borrow unrelated evidence. Champion, role, patch, matchup scope and sample gates remain unchanged. Evidence runs out when the collected sequence has no next purchase.
- Percentage magic-penetration and armor-penetration families cannot be duplicated in the planned core or against retained inventory. Recipe components consumed by the proposed upgrade are excluded before checking. Flat penetration is not blocked. Existing named unique-passive checks remain. This is a targeted guard, not a claim of complete coverage of every shop restriction.
- In live play, web targets and alternatives come only from the desktop coach output. If current advice is unavailable, the web no longer substitutes the pre-game build. Pre-game recommendations remain available during draft.

## Validation

New regressions cover evidence after a completed item, rearranged inventory, missing prefixes, role/patch isolation, duplicate percentage-penetration families, valid upgrades and flat penetration. A catalog-wide check exercises every fully described champion's core.

A separate integration check runs the real build engine, desktop coach, and serialized web-detail projection for three inventories, comparing purchases, costs, change, deferred items, recipes, milestones and alternatives. A missing-result case verifies that old draft targets are not resurrected. This checks the shared data path; it is not a Windows/League or production-network test.

Four focused regression cases fail against the previous implementation and pass with these changes. Type checking and web/desktop Vite builds pass. The local unit/API/integration suite has 637 passing cases and one pre-existing skipped case (the initial source-policy check flagged an item name in a comment; removing that comment reference and rerunning its 37-test file passed).

## Limits

No live Render statistics or Windows client were used in this verification. Earlier screenshots used a manually assembled web fixture and are not proof of end-to-end synchronization. The engine remains heuristic when matching evidence is unavailable. Cross-target spending explanations and the amount of on-screen detail need separate follow-up; this change does not certify the optimal build for every matchup. No deployment, release, or installer is included.

## Conditional purchases and recipe commitment

The simulated solo-lane example selected a healing-reduction legendary because the enemy team contained healing and the item's AP/haste were gold-efficient. It did not establish that healing was deciding the lane or fights. The same stat-efficiency scoring overvalued a cheap ally-triggered damage item, and the shopper spent leftover gold on its components before finishing the first target.

- Healing-reduction items stay out of the scheduled core without a strong current lane-healing signal or eligible purchase evidence. They remain conditional alternatives against relevant team healing. This is a conservative heuristic, not direct measurement of healing prevented or proof of optimal timing.
- Ally-triggered damage payoffs are discounted outside the support role based on effect text, without champion or item IDs. Existing role/patch/prefix evidence can still influence the ranking. Text recognition is incomplete and is not a general simulation of item effects.
- Cross-recipe purchases now pay an opportunity cost for gold diverted from the first unfinished recipe. A sufficiently more useful purchase can still complete another item while retaining existing components. Equal-value spare components no longer justify delay by themselves. The 1.1 multiplier is a conservative policy parameter, not a learned win-rate result.
- Regression tests cover the solo-lane/team-healing distinction, continued conditional antiheal availability, ally-triggered solo value, and saving surplus gold. Existing cross-target completion and inventory-consumption tests remain in force; the shared-route test supplies a material utility advantage to justify the switch under the new policy.

These changes do not replace the statistical data pipeline or certify every champion/role/matchup. Both API and desktop must use this revision for consistent results; an unchanged production deployment will continue its previous recommendations.

## Resistance, fallback and later-slot review

- Penetration scoring now separates purchased armor from purchased magic resistance. Health/armor alone cannot raise the magic-penetration weight. The signal is the highest purchased resistance on a revealed opponent; base/per-level resistances and actual target access are not modeled here. Enemy threat explanations list armor and MR separately.
- MR spell-shield core picks require either eligible purchase evidence or at least a 30% estimated enemy magic-damage share. They remain situational options; this conservative threshold is not an empirically learned build rule.
- Ally-trigger discount now lives in the shared score function, so components, core and alternatives use it consistently. Ill-fitting tank counters are omitted when a compatible defensive replacement is unavailable/already selected.
- Later-slot recipe costs use projected inventory after earlier recipes consume components. Their recall wallet and completion time are explicitly unknown; current money is not reused. The separate shopping planner still projects times from its stated income assumption.
- Every materialized pick states when no eligible purchase evidence was used, including later and situational items.

Statistics audit: `/api/desktop/items` reads `championStats` and passes `buildEvidence` to the engine. This accepts only matching champion/role/current patch, preserves raw counters, and separates first items from matching completed-item sequences. A scope needs 100 observations and an option needs 30; supported matchup data wins over general-role data. Popularity, sample size and shrunk observed WR contribute a bonus, not a causal win prediction. Components use mechanical utility, not component WR. The screenshot simulation supplies no evidence object. Production sample availability was not queried in this review; earlier user exports are historical and do not prove current full matchup coverage.

Regression coverage includes separate resistances, physical-heavy core guard, ally-trigger parity in alternatives, consumed-component costs/unknown future wallets and unsuitable fallback omission. The existing tank test now supplies real resistance items rather than requiring penetration solely from champion class.

Validation of this follow-up: three regressions fail on the preceding revision and pass after the fixes. Full local suite: 815 passed, one PostgreSQL-only skip. A final added armor-versus-MR scoring regression passed in the focused 53-test build/economy run. Typecheck and both Vite builds passed. The reproduced no-evidence example selects Malignance, then conditional Zhonya's Hourglass and Lich Bane; immediate purchase is Lost Chapter. This output is not an optimality claim or a Render deployment.
