import { describe, expect, it } from "vitest";
import { generateHistory, SYNTHETIC_ITEMS } from "@coach/synthetic";
import {
  ALLOWED_CATEGORIES,
  BLOCKED_CATEGORIES,
  DEFAULT_CONTROLS,
  LiveEngine,
  modeInfo,
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

describe("review regressions", () => {
  const cfg = { bigItemGold: 1000, spikeLevels: [6, 11, 16] };
  const base = (t: number, myLevel: number, oppLevel: number, events: { EventID: number; EventName: string; EventTime: number }[] = []) => ({
    activePlayer: { riotId: "Me#1" },
    allPlayers: [
      { championName: "A", riotId: "Me#1", team: "ORDER", level: myLevel, position: "MIDDLE", items: [] },
      { championName: "B", riotId: "Opp#1", team: "CHAOS", level: oppLevel, position: "MIDDLE", items: [] },
    ],
    events: { Events: events },
    gameData: { gameTime: t, gameMode: "CLASSIC" },
  });

  it("keeps a second important notice from the same update for later", () => {
    const e = new LiveEngine(cfg);
    e.tick(base(500, 5, 5), DEFAULT_CONTROLS, null);
    const first = e.tick(base(502, 6, 6), DEFAULT_CONTROLS, null).deliveries;
    expect(first).toHaveLength(1);
    let second: Delivery[] = [];
    for (let t = 504; t <= 560 && !second.length; t += 2) second = e.tick(base(t, 6, 6), DEFAULT_CONTROLS, null).deliveries;
    expect(second).toHaveLength(1);
    expect(second[0]!.signal.key).not.toBe(first[0]!.signal.key);
  });

  it("speaks normally in a second game within the same session", () => {
    const e = new LiveEngine(cfg);
    e.tick(base(1500, 5, 5), DEFAULT_CONTROLS, null);
    expect(e.tick(base(1502, 6, 5), DEFAULT_CONTROLS, null).deliveries).toHaveLength(1);
    // New game starts: clock goes back.
    e.tick(base(10, 1, 1), DEFAULT_CONTROLS, null);
    e.tick(base(500, 5, 5), DEFAULT_CONTROLS, null);
    const again = e.tick(base(502, 6, 5), DEFAULT_CONTROLS, null).deliveries;
    expect(again.map((d) => d.signal.key)).toContain("own-level-6");
  });

  it("does not announce objectives that happened before the Coach started", () => {
    const e = new LiveEngine(cfg);
    const controls = { ...DEFAULT_CONTROLS, categories: { ...DEFAULT_CONTROLS.categories, objective_taken: true } };
    const old = [{ EventID: 1, EventName: "DragonKill", EventTime: 300, KillerName: "Opp#1" }];
    e.tick(base(1200, 10, 10, old), controls, null); // Coach starts mid-game: prev state is empty
    const d = e.tick(base(1202, 10, 10, old), controls, null).deliveries;
    expect(d.filter((x) => x.signal.category === "objective_taken")).toHaveLength(0);
  });
});

describe("game modes", () => {
  const cfg = { bigItemGold: 1000, spikeLevels: [6, 11, 16], itemPrices: new Map([[1, 3000], [2, 3000], [3, 300]]) };
  type Enemy = { name: string; items: number[]; level?: number };
  const snap = (t: number, enemies: Enemy[], opts: { mode?: string; map?: number; position?: string } = {}) => ({
    activePlayer: { riotId: "Me#1" },
    allPlayers: [
      { championName: "A", riotId: "Me#1", team: "ORDER", level: 8, position: opts.position ?? "", items: [] },
      ...enemies.map((e) => ({ championName: e.name, riotId: `${e.name}#1`, team: "CHAOS", level: e.level ?? 8, position: opts.position ?? "", items: e.items.map((itemID) => ({ itemID })) })),
    ],
    events: { Events: [] },
    gameData: { gameTime: t, gameMode: opts.mode ?? "ARAM", mapNumber: opts.map ?? 12 },
  });
  const keys = (e: LiveEngine, s: ReturnType<typeof snap>) => e.tick(s, DEFAULT_CONTROLS, null).deliveries.map((d) => d.signal.key);

  it("labels the mode the game reports, and unknown modes by their own code", () => {
    const e = new LiveEngine(cfg);
    expect(modeInfo(e.tick(snap(60, []), DEFAULT_CONTROLS, null).state)).toEqual({ label: "ARAM · Abismo de los Lamentos", lanes: false });
    const sr = new LiveEngine(cfg).tick(snap(60, [], { mode: "CLASSIC", map: 11, position: "MIDDLE" }), DEFAULT_CONTROLS, null).state;
    expect(modeInfo(sr)).toEqual({ label: "Grieta del Invocador", lanes: true });
    const other = new LiveEngine(cfg).tick(snap(60, [], { mode: "NEWMODE", map: 99 }), DEFAULT_CONTROLS, null).state;
    expect(modeInfo(other)!.label).toBe("NEWMODE");
  });

  it("without lanes, tells when one enemy leads in completed big items, not on ties", () => {
    const e = new LiveEngine(cfg);
    keys(e, snap(300, [{ name: "B", items: [] }, { name: "C", items: [] }]));
    expect(keys(e, snap(302, [{ name: "B", items: [1] }, { name: "C", items: [1] }]))).toEqual([]); // tie → nothing
    expect(keys(e, snap(304, [{ name: "B", items: [1, 2] }, { name: "C", items: [1, 3] }]))).toEqual(["enemy-leader-B-2"]);
    expect(keys(e, snap(306, [{ name: "B", items: [1, 2] }, { name: "C", items: [1, 3] }]))).toEqual([]); // no repeats
  });

  it("without lanes, does not announce every enemy reaching level 6", () => {
    const e = new LiveEngine(cfg);
    keys(e, snap(400, [{ name: "B", items: [], level: 5 }, { name: "C", items: [], level: 5 }]));
    const k = keys(e, snap(402, [{ name: "B", items: [], level: 6 }, { name: "C", items: [], level: 6 }]));
    expect(k.filter((x) => x.startsWith("enemy-level"))).toEqual([]);
  });

  it("an ARAM game replayed end to end stays quiet, allowed and order-free", () => {
    const aram = generateHistory({ seed: 5, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 10, scenarios: { normal: 0, stomp_win: 0, stomp_loss: 0, comeback: 0, throw: 0, remake: 0, aram: 1, missing_timeline: 0, unsupported_mode: 0 } })[0]!;
    const engine = new LiveEngine({ bigItemGold: 1000, spikeLevels: [6, 11, 16], itemPrices: prices, itemNames: names });
    const policy = new PolicyEngine();
    const shown: Delivery[] = [];
    let info = null;
    for (let t = 0; t <= aram.match.info.gameDuration; t += 2) {
      const tick = engine.tick(snapshotAt(aram.match, aram.timeline!, "me", t, prices), DEFAULT_CONTROLS, null);
      info ??= modeInfo(tick.state);
      shown.push(...tick.deliveries);
    }
    expect(info).toMatchObject({ lanes: false });
    expect(shown.length).toBeLessThan(15);
    for (const d of shown) expect(policy.check(d.signal.category, d.signal.text).allowed).toBe(true);
  });
});
