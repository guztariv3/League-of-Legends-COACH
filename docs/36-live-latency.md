# Live transition latency

## Completed previous handoff

The champion-preview correction is in draft PR #51 at `dc8268ead070caf7dcc1991d25b6ac317984fd5d`. CI run 36585017941 and Windows build run 36585017943 succeeded. Artifact 11041776584 belongs to that exact commit; it has not been published as a release and Render is unchanged.

The NSIS-installed executable extracted from that artifact has SHA256 `0ba2f141b3ab777261f6de67d106e161eb8d51d116722259dbcddf87d3bee891`. This is the executable hash, not the ZIP, MSI or installer hash.

## Additional local latency changes

The reported 6–7 second delay can include three waits: the League reader's retry, the relay's ten-second idle timer, and web polling (previously ten seconds when hidden).

- Phase changes, selected champion changes, lock-in and completed draft responses now wake the relay after a 150 ms coalescing delay. These updates bypass the idle publication timer.
- Only one publication/synchronization loop runs at a time. Changes during a pending request coalesce into a latest-state follow-up; no backlog of obsolete frames is sent.
- When the League reader cannot find the client, retry after two seconds instead of ten. Active champion-select reads remain at 400 ms.
- Web polling is one second while visible and two seconds while hidden, measured after a request completes. This increases read traffic from the previous 2/10-second intervals; multiple tabs multiply it. Browser timer throttling and network/server processing still affect observed delay.
- Disabled sharing remains silent. Ordinary idle publication retains its ten-second interval; only actual state changes wake it early.

## Verification

12 desktop E2E tests passed: hover/lock-in, late-response rejection, sharing privacy, clock offsets, stale captures, structured frames and a new bounded transition test. The transition test advances 2.6 simulated seconds after the client becomes available, then 0.8 seconds after a pick changes; it verifies that the new frames were sent without waiting ten seconds. These are simulated test bounds, not an end-to-end Windows performance promise.

The clock test mock now records the observation timestamp for each published frame instead of comparing early frames against the last read of the entire test. The 65-second retained-capture test waits for the mock reader to stop before measuring that age; acceptance and age requirements remain unchanged.

Four web E2E tests passed on desktop/mobile, including the real test API, private account isolation, phase navigation and stale-data hiding. Typecheck and web/desktop builds are checked locally. The latency changes need a separate authorized upload and new CI/installer; the artifact above contains the preview correction only.

A real-data local server is still needed for real champion names, artwork and contextual recommendations. Faster delivery does not create missing game knowledge or match evidence.
