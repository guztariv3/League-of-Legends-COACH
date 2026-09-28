# Structured Live Companion and contextual shopping

Review branch based on `9181fed` (PR #50). No production deployment or release is part of this change.

## Behavior

- The desktop's shared Coach remains the only source of purchase recommendations. The web renders an optional, bounded `detail` projection in the existing version-1 private Live frame. Existing clients without `detail` keep their text view.
- Recommended Build displays ordered affordable purchases, remaining gold, target items, owned components and combination costs, recommended versus equipped runes/spells, skill priority and the reference level sequence when available.
- Summoner Insights pairs known roles, shows current scoreboard information and reported loadouts, and includes existing scouted ranks/history only when the player identity matches. Unconfirmed roles are not asserted as lane assignments. Missing history is not converted to percentages or invented tendencies.
- Paused, loading, disconnected and stale states suppress both structured views and advice. Generic profile coaching popups are suppressed on `/live` so they do not obscure or contradict the match view.
- Both clients display the same purchase sequence. Boots participate in the target plan. The planner may finish a later target while preserving components of an earlier target.

## Purchase search

The contextual path searches up to six targets, eight purchases and 24 retained inventory states per depth. Each candidate consumes its owned recipe components before checking six-slot capacity. Marginal value subtracts the value of consumed components; contextual utility comes from the existing build engine, with an ordered-target preference and a completion bonus. Unknown utilities do not manufacture urgency. Without contextual utility, the conservative sequential planner remains available and the UI marks local guidance as limited.

This is a bounded heuristic, not a guarantee of the globally optimal purchase. Waiting suggestions sample three nearby budgets for contextual search; conservative search retains 25-gold increments. Recipe projections support three component levels and allocate owned pieces once across targets. The compact suggestion and full planner now use the same recursive recipe accounting. Estimates assume the displayed completion order and observed income; they are not promises about future income, recalls or enemy purchases.

## Data and compatibility

- No new package dependencies or lockfile changes.
- Optional player spells/runes are taken only from fields reported by Live Client Data. No hidden identities, cooldown tracking or enemy wallets are inferred.
- API schema bounds teams, shopping lists and recursive trees, in addition to the existing request-size limit.
- Existing capture stamps, clock synchronization, freshness limits, session ordering and sharing-off behavior remain in place.
- Synthetic knowledge is explicitly labeled. A local server without a real knowledge bundle/Riot configuration cannot validate match recommendation quality. Art depends on the configured asset bundle/CDN; offline and synthetic contexts keep the existing fallbacks.

## Verification

Tests cover later-target completion, shared-component consumption, full inventory, recursive discounts, unavailable data, protocol compatibility and payload bounds. Web browser tests exercise both tabs on desktop/mobile and hiding them on pause/staleness. Desktop browser tests exercise clock changes, stale captures and sharing privacy, plus validation of an emitted structured frame against the API schema. Existing draft-response and game-end tests are retained.

An indicative local benchmark (30 plans, four real-catalog targets, 1,300 gold, one owned component, uniform utility) averaged 4.6 ms per plan. This is not a Windows/League performance measurement.

The API integration fixture now generates recent games relative to the test time instead of June 2026: its activity assertion previously expired as the calendar moved forward.

## Remaining validation and coverage

- Real League/Windows: LCU field availability, draft hover/lock/trade/dodge, team role accuracy, rendering performance, active-data sharing off, reconnect and next-match reset.
- Rank/history coverage remains limited to the existing scouting data. A full champion-history/tendency dataset for every teammate is not supplied by this change.
- Early/mid/late team power curves are explicitly unavailable until supported by a validated model; no fake win probability is displayed.
- Enemy completion forecasts and hidden gold are not available. Only observable inventory and the existing contextual build evidence are used.
- The displayed sequence orders this shopping visit. Future trees/targets adapt on subsequent snapshots; it is not a rigid promise of every future shop action.

To try the branch, use its matching API/web and desktop build together. Do not connect the updated companion to the old production API: the old strict frame schema does not know `detail`.

## Follow-up: shop and inventory consistency

The component planner now preserves Data Dragon shop availability in `CatalogItem.purchasable`. Unavailable recipe nodes are not offered as purchases or wait-for-gold purchases. Owned unavailable pieces still count toward a buyable parent recipe. The compact `affordableNow` suggestion now uses the same recipe-consumption and six-slot simulation as the full route, including the separate trinket slot.

Regression coverage includes unavailable components with/without contextual utility, credit for already-owned unavailable components, source restriction parsing, and a full inventory that permits upgrades but forbids new loose pieces. Existing tests retain cross-target completion, holding an unfinished component, duplicate-component accounting, budget limits and ordered slot freeing.

This does not establish strategically optimal component order. Contextual utility remains a heuristic; waiting and future completion times are approximations. Shop availability metadata does not fully model champion-specific exceptions, quest unlocks, item-group exclusivity, consumable stacking or every map-specific rule. This revision does not certify those cases or all champion/matchup builds.

## Follow-up: component priority scoring

A regression reproduced an artificial advantage from acquiring a shared component under an earlier target and consuming it immediately under a later target. The previous score discounted each transition separately, so the same final inventory could score differently depending on the route labels. The new score measures inventory value relative to the starting inventory with fixed per-item recipe priorities and a fixed completion bonus. Identical final inventories now have the same value; ties favor fewer purchases. Waiting comparisons use this same value rather than summing the costs of intermediate purchases weighted by their utilities.

The utility supplied by the build engine is still heuristic: champion stat fit, enemy damage/threat estimates and modeled item effects. It is not a matchup win-rate estimate for each component, nor does it fully simulate cooldown breakpoints, lane trading, sustain, stacking progress or lost passive effects. The bounded search still trades exhaustive optimality for runtime limits. A test verifies that higher contextual utility can select the cheaper component while leaving gold unspent, and that reversing those utilities changes the choice. The shared-component regression fails before the correction and passes after it.

## Follow-up: timing after a cross-target purchase

Completion-time forecasts now start from the simulated post-purchase inventory and leftover wallet. Previously, the plan could recommend a component of a later target while simultaneously treating that spent gold as available to finish the first target. The regression buys a 400-gold component of the second target and verifies that the first target still needs its full 1000 gold of future income, while the second benefits from its owned component. It fails on the previous code and passes with the fix. The displayed recipe cost remains the pre-shopping projection; timestamps are conditional on following the shopping plan and then completing the listed targets at the estimated income pace. These remain estimates, not promised completion times.
