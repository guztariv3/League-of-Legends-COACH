import { snapshotAt } from "@coach/live";
import { generateHistory, SYNTHETIC_ITEMS } from "@coach/synthetic";

/**
 * Demo mode: replays a synthetic game "as if live", so the Coach can be tried
 * without League running. It is always labelled as a demo in the UI.
 */
export function createDemo(speed = 20) {
  const game = generateHistory({
    seed: Date.now() % 100_000, puuid: "demo-me", gameName: "You", tagLine: "DEMO", platform: "euw1", count: 1,
    scenarios: { normal: 1, stomp_win: 0, stomp_loss: 0, comeback: 0, throw: 0, remake: 0, aram: 0, missing_timeline: 0, unsupported_mode: 0 },
  })[0]!;
  const prices = new Map(SYNTHETIC_ITEMS.map((i) => [i.id, i.gold]));
  const names = new Map(SYNTHETIC_ITEMS.map((i) => [i.id, i.name]));
  const startedAt = performance.now();
  return {
    itemPrices: prices,
    itemNames: names,
    /** Synthetic items are cheap, so the "big item" threshold is lowered for the demo. */
    bigItemGold: 1000,
    duration: game.match.info.gameDuration,
    snapshot() {
      const t = Math.min(game.match.info.gameDuration, Math.floor(((performance.now() - startedAt) / 1000) * speed));
      return snapshotAt(game.match, game.timeline!, "demo-me", t, prices);
    },
  };
}
