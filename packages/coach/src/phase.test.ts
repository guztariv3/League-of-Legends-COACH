import { describe, expect, it } from "vitest";
import { AllGameData, emptyState, reduceState } from "@coach/live";
import { phaseDecisions, pickNow } from "./index.js";

interface P { level?: number; respawn?: number }
/** You are Ahri mid against Syndra; `respawn` > 0 means that player is dead for that long. */
function game(opts: { time?: number; me?: P; opp?: P; jungler?: P; enemies?: P; allies?: P; deadEnemies?: number; deadAllies?: number; r?: number; turretDown?: boolean }) {
  const t = opts.time ?? 400;
  const lanes = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const champs = { ORDER: ["Garen", "LeeSin", "Ahri", "Jinx", "Thresh"], CHAOS: ["Darius", "Vi", "Syndra", "Caitlyn", "Leona"] } as const;
  const players = (["ORDER", "CHAOS"] as const).flatMap((team) => lanes.map((pos, i) => {
    const name = champs[team][i]!;
    const p: P = team === "ORDER"
      ? pos === "MIDDLE" ? opts.me ?? {} : opts.allies ?? {}
      : pos === "MIDDLE" ? opts.opp ?? {} : pos === "JUNGLE" ? opts.jungler ?? opts.enemies ?? {} : opts.enemies ?? {};
    // The first N non-mid players of a team are dead for 20s.
    const n = team === "ORDER" ? opts.deadAllies ?? 0 : opts.deadEnemies ?? 0;
    const forced = pos !== "MIDDLE" && [0, 3, 4, 1].slice(0, n).includes(i) ? 20 : 0;
    const respawn = p.respawn ?? forced;
    return { championName: name, rawChampionName: `game_character_displayname_${name}`, riotId: `${name}#NA1`, team, position: pos, level: p.level ?? 5, items: [], isDead: respawn > 0, respawnTimer: respawn, scores: { deaths: 1 } };
  }));
  return reduceState(emptyState(), AllGameData.parse({
    activePlayer: { riotId: "Ahri#NA1", level: opts.me?.level ?? 5, abilities: { Q: { abilityLevel: 3 }, W: { abilityLevel: 1 }, E: { abilityLevel: 1 }, R: { abilityLevel: opts.r ?? 0 } } },
    allPlayers: players,
    events: { Events: opts.turretDown ? [{ EventID: 1, EventName: "TurretKilled", EventTime: t - 30, TurretKilled: "Turret_T2_L_03_A", KillerName: "Garen#NA1" }] : [] },
    gameData: { gameMode: "CLASSIC", gameTime: t, mapNumber: 11 },
  }));
}
const run = (st: ReturnType<typeof game>) => phaseDecisions({ state: st, turretsDown: st.events.filter((e) => e.EventName === "TurretKilled").length, purchase: null });

describe("gameplay by phase (phase 6)", () => {
  it("reads respawn timers from the scoreboard", () => {
    const st = game({ opp: { respawn: 17 } });
    expect(st.enemies.find((e) => e.champion === "Syndra")).toMatchObject({ isDead: true, respawn: 17 });
    expect(st.me!.respawn).toBeNull();
  });

  it("your lane opponent is dead: push, then plates before 14:00, with the timer", () => {
    const d = run(game({ opp: { respawn: 17 } })).find((x) => x.id.startsWith("phase:opp-dead"))!;
    expect(d.kind).toBe("moment");
    expect(d.headline).toBe("Syndra is dead for 17s: push your wave, then hit the turret");
    expect(d.reasons[1]).toMatch(/turret plate gives gold/);
    expect(d.evidence[0]).toMatchObject({ value: "17s", source: "this_game" });
  });

  it("a window too short to use is not mentioned", () => {
    expect(run(game({ opp: { respawn: 5 } }))).toEqual([]);
  });

  it("their jungler is dead: no gank can come", () => {
    const d = run(game({ jungler: { respawn: 30 } }));
    expect(d.map((x) => x.id)).toContain("phase:jungler-dead:1");
    expect(d[0]!.headline).toMatch(/Their jungler \(Vi\) is dead for 30s/);
  });

  it("level 6 first is a window; theirs first is a warning; no ultimate timers of theirs are tracked", () => {
    const mine = run(game({ me: { level: 6 }, opp: { level: 5 }, r: 1 }));
    expect(mine.map((x) => x.id)).toEqual(["phase:level6-first"]);
    const theirs = run(game({ me: { level: 5 }, opp: { level: 6 } }));
    expect(theirs[0]).toMatchObject({ kind: "warning", id: "warning:level6-behind" });
    expect(JSON.stringify(theirs)).not.toMatch(/cooldown/i);
    expect(run(game({ time: 150, me: { level: 2 }, opp: { level: 1 } }))[0]!.headline).toMatch(/level 2 first/);
  });

  it("more enemies dead than allies: take a turret or an objective before they respawn", () => {
    const d = run(game({ turretDown: true, time: 1500, deadEnemies: 3, deadAllies: 1 }));
    const m = d.find((x) => x.id.startsWith("phase:numbers"))!;
    expect(m.headline).toBe("3 enemies are dead for at least 20s: take a turret or an objective with your team");
    expect(m.priority).toBe("important");
  });

  it("a closing window ranks above the next item, below survival", () => {
    const moment = run(game({ opp: { respawn: 17 } }))[0]!;
    const item = { ...moment, id: "item:6655", kind: "item" as const };
    expect(pickNow([item, moment])!.id).toBe(moment.id);
    const warning = { ...moment, id: "warning:x", kind: "warning" as const };
    expect(pickNow([moment, warning])!.id).toBe("warning:x");
  });

  it("after the lane, long death timers call for staying together", () => {
    const d = run(game({ turretDown: true, time: 2000, allies: { respawn: 45 }, deadAllies: 0 }));
    expect(d.map((x) => x.id)).toContain("phase:long-timers");
  });

  it("nothing while you are dead, and nothing in a calm game", () => {
    expect(run(game({ me: { respawn: 10 }, opp: { respawn: 17 } }))).toEqual([]);
    expect(run(game({}))).toEqual([]);
  });
});
