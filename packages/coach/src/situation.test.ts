import { describe, expect, it } from "vitest";
import { parseCatalog } from "@coach/itemization";
import { AllGameData, emptyState, goldDifference, objectives, reduceState } from "@coach/live";
import { championJson, itemJson } from "../../itemization/src/test-fixture.js";
import { liveCoach, pickNow, readSituation, situationDecisions } from "./index.js";

const catalog = parseCatalog(itemJson, championJson);
const LUDENS = { itemID: 6655, price: 2750 }, RABADON = { itemID: 3089, price: 3600 }, WAND = { itemID: 1026, price: 850 }, TOME = { itemID: 1052, price: 400 };

interface P { items?: { itemID: number; price: number }[]; level?: number; dead?: boolean }
/** A Summoner's Rift game: you are Ahri mid against Syndra; the other lanes are filler. */
function game(opts: { time?: number; me?: P; opp?: P; allies?: P; enemies?: P; deadAllies?: number; deadEnemies?: number; health?: number; mana?: number; resource?: string; turretDown?: boolean }) {
  const t = opts.time ?? 600;
  const lanes = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const champs = { ORDER: ["Garen", "LeeSin", "Ahri", "Jinx", "Thresh"], CHAOS: ["Darius", "Vi", "Syndra", "Caitlyn", "Leona"] } as const;
  const players = (["ORDER", "CHAOS"] as const).flatMap((team) => lanes.map((pos, i) => {
    const name = champs[team][i]!;
    const isMe = team === "ORDER" && pos === "MIDDLE", isOpp = team === "CHAOS" && pos === "MIDDLE";
    const p: P = isMe ? opts.me ?? {} : isOpp ? opts.opp ?? {} : team === "ORDER" ? opts.allies ?? {} : opts.enemies ?? {};
    // The first N teammates other than the mid laners are dead.
    const deadCount = team === "ORDER" ? (opts.deadAllies ?? 0) : (opts.deadEnemies ?? 0);
    const dead = p.dead ?? [0, 1, 3, 4].slice(0, deadCount).includes(i);
    return { championName: name, rawChampionName: `game_character_displayname_${name}`, riotId: `${name}#NA1`, team, position: pos, level: p.level ?? 7, items: p.items ?? [], isDead: dead };
  }));
  return reduceState(emptyState(), AllGameData.parse({
    activePlayer: {
      riotId: "Ahri#NA1", level: opts.me?.level ?? 7, currentGold: 300,
      championStats: { currentHealth: (opts.health ?? 1) * 1000, maxHealth: 1000, resourceType: opts.resource ?? "MANA", resourceValue: (opts.mana ?? 1) * 600, resourceMax: 600 },
    },
    allPlayers: players,
    events: { Events: opts.turretDown ? [{ EventID: 1, EventName: "TurretKilled", EventTime: t - 30, TurretKilled: "Turret_T2_L_03_A", KillerName: "Garen#NA1" }] : [] },
    gameData: { gameMode: "CLASSIC", gameTime: t, mapNumber: 11 },
  }));
}
const plan = (st: ReturnType<typeof game>) => {
  const s = readSituation(st, goldDifference(st), objectives(st), null, catalog)!;
  return { s, d: situationDecisions(s, { time: st.time, isDead: st.me!.isDead, purchase: null }) };
};

describe("live game plan", () => {
  it("behind in lane: play for farm and safe experience, and says why with the numbers", () => {
    const { s, d } = plan(game({ me: { items: [TOME] }, opp: { items: [LUDENS], level: 9 } }));
    expect(s.lane?.standing).toBe("behind");
    const p = d.find((x) => x.kind === "gameplan")!;
    expect(p.headline).toMatch(/farm and safe experience/);
    expect(p.reasons[0]).toMatch(/item gold behind Syndra, 2 levels down/);
    expect(p.priority).toBe("important");
  });

  it("ahead in lane: turn the lead into objectives rather than extra fights", () => {
    const { s, d } = plan(game({ me: { items: [LUDENS] }, opp: { items: [TOME] } }));
    expect(s.lane?.standing).toBe("ahead");
    expect(d.find((x) => x.kind === "gameplan")?.headline).toMatch(/objectives, not extra fights/);
  });

  it("even lane with nothing to add: no plan line (it doesn't talk for the sake of it)", () => {
    const { s, d } = plan(game({ me: { items: [WAND] }, opp: { items: [WAND] } }));
    expect(s.lane?.standing).toBe("even");
    expect(d).toHaveLength(0);
  });

  it("the opponent's finished item is a warning to avoid extended trades until yours", () => {
    const { d } = plan(game({ me: { items: [WAND, TOME, TOME] }, opp: { items: [LUDENS] } }));
    const w = d.find((x) => x.kind === "warning")!;
    expect(w.headline).toBe("Syndra has 1 completed item, you have 0: avoid extended trades");
  });

  it("after the first turret falls the plan follows the team, not the lane", () => {
    const { s, d } = plan(game({ turretDown: true, allies: { items: [RABADON] }, me: { items: [WAND] }, opp: { items: [WAND] } }));
    expect(s.phase).toBe("post-lane");
    expect(s.team.standing).toBe("ahead");
    expect(d.find((x) => x.kind === "gameplan")?.headline).toMatch(/group and take objectives/);
  });
});

describe("what to avoid, and what comes first", () => {
  it("down in numbers: a critical warning, shown before anything else", () => {
    const st = game({ deadAllies: 2 });
    const { s, d } = plan(st);
    expect(s.team.alive).toBe(3);
    expect(d[0]!.headline).toBe("Your team is down 3 v 5: avoid fights and objectives");
    const c = liveCoach({ state: st, catalog });
    expect(pickNow(c.decisions)?.id).toBe(d[0]!.id); // survival beats the item decision
  });

  it("low health and low mana are warnings; energy champions get no mana warning", () => {
    expect(plan(game({ health: 0.2 })).d[0]?.headline).toBe("Low health (20%): don't take the next trade");
    expect(plan(game({ mana: 0.1 })).d[0]?.headline).toBe("Low mana (10%): avoid trades that need your abilities");
    expect(plan(game({ mana: 0.1, resource: "ENERGY" })).d.some((x) => /mana/i.test(x.headline))).toBe(false);
  });

  it("no warnings while you are dead, and none in a calm, even game", () => {
    expect(plan(game({ me: { dead: true }, deadAllies: 2 })).d.some((x) => x.kind === "warning")).toBe(false);
    expect(plan(game({})).d).toHaveLength(0);
  });
});
