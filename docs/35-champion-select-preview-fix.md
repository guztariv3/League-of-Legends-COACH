# Champion-select preview correction

Prepared after the Windows report on 2026-09-29. These changes are local until explicitly uploaded and validated in CI. Production is unchanged.

## Reproduction and confirmed causes

The latest screenshot displays `Champion select`, `draft`, and the new Companion tabs. Selection phase delivery therefore works in that capture; it is the champion/plan content that is absent. The server reports `knowledge=0.0.2-synthetic`. This demo catalog cannot resolve real numeric champion IDs from League and the server does not instantiate the contextual game-facts provider in synthetic mode.

Separately, `/desktop/plan?preview=1` deliberately returned `build:null` even when real facts were available. The desktop also hid the build until lock-in. Both prevented the requested pre-lock rune and item preview.

## Changes

- Hover uses the same server recommendation path as lock-in. Existing client debounce, cache, account/pick ownership and late-response guards remain in place.
- Desktop displays the returned build and setup before confirmation, explicitly marked provisional. The personal game-plan panel remains available after lock-in.
- Relay and detailed team view retain the actual selected champion ID and revealed team IDs when no server plan exists. Missing names/images/recommendations are not fabricated.
- Rust selection reduction preserves the declared champion when an in-progress pick action still contains zero. A nonzero current action retains priority over an older declaration.

## Validation

- API suite: 8 tests passed, including hover build/rune/spell output against the lock-in response.
- Live detail/parity suite: 5 tests passed, including raw pick preservation without a plan and without invented recommendations.
- Champion-select interface: 2 tests passed, including pre-lock build visibility and rejection of an old hover response.
- Typecheck and web/desktop builds checked locally.
- Rust regression added for a zero-ID in-progress action; cargo is unavailable locally, so Rust and a new Windows installer still require GitHub CI.

## Remaining operational step

The user's installed NSIS executable for commit 253babe has SHA256 `323dd2aaaa303c82d2efcb5a2afd4ddadb04757294c431fe9727e8139512a598`, verified against the executable extracted from artifact 11037970294. Its MSI counterpart has a different hash; do not use the MSI binary as the reference for an NSIS installation.

That installed version does not include this new correction. A matching server update and rebuilt desktop are required. The local test server must also use real game knowledge before validating real champion names, artwork and contextual builds. The existing runtime enables this with a privately configured valid Riot key; do not send keys in chat or introduce a dummy key. STATS_CRAWL can remain 0 and DATABASE_URL must remain disconnected from production for the local test. Statistical match evidence remains separately dependent on the local database's actual coverage.

No conclusion about the reported Morellonomicon recommendation follows merely from this fix. The first screenshot used an older installed executable, and a synthetic server is unsuitable for strategic validation. Reproduce on matching versions with real knowledge and capture the displayed reason and actual enemy state before claiming that issue is resolved.
