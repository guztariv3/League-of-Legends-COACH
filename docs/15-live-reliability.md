# Live Coach reliability — first correction set

Scope: Now priority, conditional gameplay advice, connection continuity, inventory capacity and pause behavior. UI copy remains English. No database migration or new dependency is required.

## Changes

- `pickNow` retains a previous choice only within the same priority and decision kind. A warning or closing opportunity can displace an existing item recommendation.
- Phase advice distinguishes observed deaths/levels from interpretations. It does not guarantee an uncontested lane, a safe recall, absence of rotations or readiness of an enemy ultimate.
- A failed or invalid live snapshot hides proactive recommendations and the overlay, clears visible notices, and preserves the match for a 30-second grace period. Valid data resumes the match without replaying missed notices. `GameEnd` still ends the match immediately; sustained unavailability returns Home.
- The purchase planner checks six ordinary inventory slots, excludes trinkets, consumes existing recipe components and orders combinations before loose purchases. A full completed build does not trigger an automatic seventh-item recommendation or sale.
- Pause suppresses the Now board, overlay and visible notifications. Queued notifications are discarded rather than replayed on resume. Snapshot polling continues so the app can still detect a match end.

## Verification

15 isolated checks passed against the actual source using the existing Node runtime: priority transitions and stability, connection failure/recovery/expiry, conditional advice, full-build recommendations, purchase capacity and component consumption, trinkets, buying after completing a target, and clearing queued notifications.

Modified TypeScript/TSX files were parsed for syntax using the existing parser. This is not a type check.

Regression tests were added to the project's Vitest files and the existing desktop Playwright scenarios. The full Vitest, TypeScript, Playwright, Docker and Rust gates were not run locally because this workspace does not have the project's dependencies installed. They must pass in GitHub CI before merging.

Required commands in a configured project environment:

```sh
pnpm check
pnpm test:e2e
pnpm test:e2e:desktop
```

After merging, build and publish the Windows test installer using the existing workflow. The installed desktop app does not update itself. Re-test on Windows with LoL: brief disconnection and recovery, actual game end, pause/resume, and component upgrades in a full inventory. No claim is made about measured FPS or CPU impact.

## Remaining scope

This change does not implement the other audit findings: atomic statistics, role-specific plan requests, stale server-response handling, patch refresh, service quotas, Riot request timeouts or mixed advantage classification. It also does not implement automatic item sales or special champion purchase restrictions. The 30-second timeout is a conservative UI fallback, not proof from the game that a match ended.
