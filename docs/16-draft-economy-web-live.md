# Shared Draft, economy and web Live — implementation and verification

Status: local implementation for review. Not deployed. TypeScript/API/browser validation is recorded
below. Native Rust/Windows and real League validation remain required before release.
This extends the existing coach and keeps the earlier reliability corrections.

## Architecture

The desktop reads the local client; credentials remain in Rust. The existing shared coach generates
live decisions once. The Board reports the exact displayed result, including its retained Now decision.
A display-only protocol forwards the result through the authenticated site to `/live`.
The web does not run a competing recommendation engine. Existing profile, history and coaching remain.

Private sharing is off initially. Enable it under desktop Settings after pairing. While it is off the
companion publishes nothing; turning it off sends one empty frame that replaces what was shared
(integration fix, covered by `apps/desktop/e2e/live-share.spec.ts`). The relay uses the
existing device token over HTTPS, disables redirects, permits one publication in flight, and bounds
its request timeout. No browser connection to League, new external services or new dependencies.
API writes are authenticated, rate/size/schema limited; reads use the signed-in user's ownership.
Latest frames are persisted per device with sequence/timestamp guards. Revocation deletes the frame.
Advice expires after 15 seconds. Pause/reconnection/loading have no active advice. Completed summaries
are last observed snapshots, not authoritative final statistics. Verified post-game analysis still uses
Riot history/timeline ingestion; bounded delayed sync attempts run after the end signal. Match-stat
aggregation now claims and increments each match inside one transaction to prevent duplicate counts.

## Draft

Polls every 400 ms during Champion Select; debounce 150 ms. Lightweight preview avoids history,
Master statistics and full builds on every hover. Thirty-second, bounded, per-account context cache.
Responses are keyed to the current champion/composition/lock state, so old answers cannot display.
Own pick actions distinguish provisional and completed selection; completed trades use the current
team champion. Blank in-progress picks clear the old choice. Bans/timer/allied positions are retained
by the native reducer and shown in expandable draft details; enemy roles remain explicitly uncertain.

Draft read compares revealed kits, resource/scaling facts, damage gaps, durability, CC and selected
mechanical signals. Explanations and partial coverage are visible. It does not infer a complete team
from one pick or reveal anonymous players. Mouse movement alone is not promised to be detectable.
LCU is not an officially supported third-party API: actual fields must be verified on the installed
client. Draft auto-detection can fail when those unsupported interfaces change.

## Economy

The build request now includes current gold, match time, observed income approximation and whether
the visible lane opponent already owns a completed item. Each candidate includes remaining recipe
cost, affordable component usefulness and conditional completion time. Delay discounts combat value;
there is no maximum first-item price. Owned components influence commitment. Amplified critical
strike damage is valued with the current/hypothetical critical chance instead of a flat rush bonus.
The same stat/kit/threat scorer supplies component utility to purchase planning; maximizing spending
is no longer the sole objective. Existing inventory-slot checks remain. Waiting thresholds are options,
not instructions to stand in base.

The time model is an approximation, not a calibrated forecast: current gold plus inventory value cannot
reconstruct consumed items, sales, free upgrades or the exact source of income. It does not assume
future kills. Before reliable income exists it reports unknown timing. Enemy wallet and future item
intent are unknown; this implementation compares a visible completed spike, not a fabricated enemy ETA.
Pre-game baseline: up to twelve authorized personal timelines on the current patch, same champion
and role when at least three games exist; otherwise same role. Each game needs at least four usable
30–90 second intervals between 2:30 and 15:00. Intervals containing the player's kill or assist are
excluded. Median income/CS per game prevents a longer match from dominating; the interquartile
range and sample are disclosed. Passive, farm and other observed non-kill income are combined,
not falsely separated into precise sources. First-recall budgets use observed pre-recall snapshots,
not promises of checkout gold. Below the sample threshold the estimate remains unknown.
These baseline scenarios inform pre-game item scoring. Live scoring still uses actual wallet and
inventory pace (including already earned rewards), with conditional estimates. Richer opponent
forecasting and validated champion-by-champion matchup interactions remain follow-up work.

## Current coverage and remaining gates

Implemented: provisional draft view; full existing pre-game view after lock; economy context and
component utility; one displayed Live answer across desktop/web; private sharing; freshness and
revocation; match-end cleanup and ingestion retry; idempotent aggregate writes.

Actual equipped runes and summoner spells are now read when reported by the Live Client API and
are clearly separated from recommended pre-game setup. Rune ids with missing names are labelled
as such; no spell cooldown is inferred. The personal section includes champion sample and recurring
patterns. Detailed composition reasoning is still kit-derived; mastery/rank and comprehensive matchup
interactions are not invented when missing. The three requested changes are not certified complete.

Additional regression fixes: account-specific draft/pre-game responses cannot be reused after a
link switch. Mobile profile grid columns no longer override their responsive breakpoint; the Live
status is visible on mobile. API startup uses Node's existing tsx import hook, avoiding the tsx CLI's
unnecessary IPC listener. No dependency versions or lockfile were changed.

Validation results are listed in LEEME.txt in the delivery package. Browser tests use a mocked native
bridge and synthetic matches; they do not validate League's currently installed LCU schema.

CI uses pnpm 10.33 and Node 22. Local validation uses Node 24.19 (allowed by the project),
pnpm 10.33, frozen lockfile, TypeScript, Vitest and Chromium. Native Rust/Windows build is outstanding. Install the newly built desktop: the old test installer does not
contain these changes. Validate rapid hover A/B, lock, trades, dodge, loading, pause, reconnection,
end/new-game without a disconnected gap, and consistency between both screens. Measure latency/CPU
in Windows before claiming a performance guarantee. Update the Riot Developer Portal feature description
before release; technical access is not approval of a product use case.

Sources reviewed: https://developer.riotgames.com/docs/lol and
https://developer.riotgames.com/policies/general (2026-09-27).

Patch handling: CommunityDragon rune URLs are now pinned to the Data Dragon major/minor patch.
A facts bundle from an older Data Dragon patch is withheld after the active patch changes. Meraki
remains the existing latest-only source; its mechanics are not independently patch-certified.
