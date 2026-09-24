import { describe, expect, it } from "vitest";
import { generateHistory, SYNTHETIC_ITEMS } from "@coach/synthetic";
import {
  ALLOWED_CATEGORIES,
  BLOCKED_CATEGORIES,
  DEFAULT_CONTROLS,
  LiveEngine,
  PolicyEngine,
  SafeModeController,
  snapshotAt,
  type Delivery,
  type LiveControls,
} from "./index.js";

const prices = new Map(SYNTHETIC_ITEMS.map((i) => [i.id, i.gold]));
const names = new Map(SYNTHETIC_ITEMS.map((i) => [i.id, i.name]));
const game = generateHistory({ seed: 3, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 20, scenarios: { normal: 1, stomp_win: 0, stomp_loss: 0, comeback: 0, throw: 0, remake: 0, aram: 0, missing_timeline: 0, unsupported_mode: 0 } })[0]!;
const duration = game.match.info.gameDuration;

function play(controls: LiveControls = DEFAULT_CONTROLS, pollSec = 2, load: () => { cpu: number; memAvailable: number } | null = () => null) {
  const engine = new LiveEngine({ bigItemGold: 1000, spikeLevels: [6, 11, 16], itemPrices: prices, itemNames: names, focus: "csPerMin", focusTarget: 7 });
  const shown: (Delivery & { t: number })[] = [];
  let safeSeen = false;
  for (let t = 0; t <= duration; t += pollSec) {
    const tick = engine.tick(snapshotAt(game.match, game.timeline!, "me", t, prices), controls, load());
    safeSeen ||= tick.safeMode;
    for (const d of tick.deliveries) shown.push({ ...d, t });
  }
  return { shown, engine, safeSeen };
}

describe("policy engine", () => {
  const policy = new PolicyEngine();
  it("blocks prohibited categories and logs why", () => {
    for (const c of BLOCKED_CATEGORIES) expect(policy.check(c, "x").allowed).toBe(false);
    expect(policy.check("enemy_ultimate_timer", "Zed ult en 40s").reason).toBe("blocked_category");
    expect(policy.log.length).toBeGreaterThan(0);
  });
  it("blocks directive language even inside allowed categories", () => {
    expect(policy.check("own_level_spike", "Ve a gankear top ahora").allowed).toBe(false);
    expect(policy.check("objective_taken", "Go back and buy").allowed).toBe(false);
    expect(policy.check("own_level_spike", "Has llegado a nivel 6: tu definitiva ya está disponible.").allowed).toBe(true);
  });
  it("rejects unknown categories", () => {
    expect(policy.check("anything_new", "hola").reason).toBe("unknown_category");
  });
});

describe("live engine on a replayed synthetic game", () => {
  const { shown, engine } = play();

  it("speaks rarely: few messages over a whole game, at most one per update", () => {
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(Math.ceil(duration / 40));
    const perTick = new Map<number, number>();
    for (const s of shown) perTick.set(s.t, (perTick.get(s.t) ?? 0) + 1);
    expect(Math.max(...perTick.values())).toBe(1);
  });

  it("only ever shows allowed categories, never repeats a message, and never gives orders", () => {
    const keys = shown.map((s) => s.signal.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of shown) {
      expect(ALLOWED_CATEGORIES).toContain(s.signal.category);
      expect(new PolicyEngine().check(s.signal.category, s.signal.text).allowed).toBe(true);
    }
    expect(engine.policyLog.filter((l) => l.reason === "directive_language")).toHaveLength(0);
  });

  it("announces the player's level 6", () => {
    expect(shown.some((s) => s.signal.key === "own-level-6")).toBe(true);
  });

  it("keeps important messages spaced by the anti-spam gap", () => {
    const times = shown.map((s) => s.t);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(20);
  });
});

describe("controls", () => {
  it("mute and pause show nothing", () => {
    expect(play({ ...DEFAULT_CONTROLS, muted: true }).shown).toHaveLength(0);
    expect(play({ ...DEFAULT_CONTROLS, paused: true }).shown).toHaveLength(0);
  });
  it("focus mode drops informational messages", () => {
    const { shown } = play({ ...DEFAULT_CONTROLS, focus: true });
    expect(shown.every((s) => s.signal.priority === "important")).toBe(true);
  });
  it("disabled categories never interrupt", () => {
    const { shown } = play({ ...DEFAULT_CONTROLS, categories: { ...DEFAULT_CONTROLS.categories, own_level_spike: false } });
    expect(shown.some((s) => s.signal.category === "own_level_spike")).toBe(false);
  });
});

describe("safe mode", () => {
  it("activates under CPU pressure, slows polling and restores after calm samples", () => {
    const sm = new SafeModeController();
    expect(sm.update({ cpu: 20, memAvailable: 0.5 })).toBe(false);
    const normal = sm.pollMs;
    expect(sm.update({ cpu: 95, memAvailable: 0.5 })).toBe(true);
    expect(sm.reason).toBe("cpu");
    expect(sm.pollMs).toBeGreaterThan(normal);
    for (let i = 0; i < 5; i++) sm.update({ cpu: 20, memAvailable: 0.5 });
    expect(sm.isActive).toBe(true);
    sm.update({ cpu: 20, memAvailable: 0.5 });
    expect(sm.isActive).toBe(false);
  });
  it("keeps only important messages while active", () => {
    const { shown, safeSeen } = play(DEFAULT_CONTROLS, 2, () => ({ cpu: 99, memAvailable: 0.5 }));
    expect(safeSeen).toBe(true);
    expect(shown.every((s) => s.signal.priority === "important")).toBe(true);
  });
});

describe("degradation", () => {
  it("degrades instead of failing on unexpected data", () => {
    const engine = new LiveEngine({ bigItemGold: 2200, spikeLevels: [6] });
    const tick = engine.tick({ nonsense: true }, DEFAULT_CONTROLS, null);
    expect(tick.degraded).toBe("unexpected_live_data");
    expect(tick.deliveries).toHaveLength(0);
  });
});
