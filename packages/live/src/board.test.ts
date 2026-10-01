import { describe, expect, it } from "vitest";
import { AllGameData, emptyState, goldDifference, objectives, reduceState } from "./index.js";

const player = (name: string, team: "ORDER" | "CHAOS", position: string, items: [number, number][], level = 9) => ({
  championName: name, riotId: `${name}#NA1`, team, position, level,
  items: items.map(([itemID, price]) => ({ itemID, price, count: 1 })),
});

function game(opts: { positions?: boolean; abilities?: Record<string, number>; events?: Record<string, unknown>[] } = {}) {
  const pos = (p: string) => (opts.positions === false ? "" : p);
  return AllGameData.parse({
    activePlayer: {
      riotId: "Ahri#NA1", level: 9, currentGold: 1829,
      ...(opts.abilities ? { abilities: Object.fromEntries(Object.entries(opts.abilities).map(([k, v]) => [k, { abilityLevel: v }])) } : {}),
    },
    allPlayers: [
      player("Ahri", "ORDER", pos("MIDDLE"), [[3089, 3600]]),
      player("Garen", "ORDER", pos("TOP"), [[3071, 3000]]),
      player("Syndra", "CHAOS", pos("MIDDLE"), [[3165, 2200]]),
      player("Darius", "CHAOS", pos("TOP"), [[3078, 3300], [1001, 300]]),
    ],
    events: { Events: opts.events ?? [] },
    gameData: { gameMode: "CLASSIC", gameTime: 900, mapNumber: 11 },
  });
}

describe("ability ranks", () => {
  it("reads the player's ranks and the levels not yet spent", () => {
    const s = reduceState(emptyState(), game({ abilities: { Q: 4, W: 1, E: 2, R: 1 } }));
    expect(s.abilities).toEqual({ q: 4, w: 1, e: 2, r: 1 });
    expect(s.skillPoints).toBe(1);
  });

  it("stays empty when the game doesn't report them", () => {
    const s = reduceState(emptyState(), game());
    expect(s.abilities).toBeNull();
    expect(s.skillPoints).toBeNull();
  });
});

describe("gold difference", () => {
  it("pairs lanes on Summoner's Rift and sums each team, by item value", () => {
    const g = goldDifference(reduceState(emptyState(), game()))!;
    expect(g.basis).toBe("item_gold");
    expect(g.pairedBy).toBe("position");
    expect(g.rows.map((r) => [r.ally.champion, r.enemy.champion, r.diff])).toEqual([["Garen", "Darius", -600], ["Ahri", "Syndra", 1400]]);
    expect([g.allyTotal, g.enemyTotal]).toEqual([6600, 5800]);
  });

  it("pairs by order when the game reports no lanes", () => {
    const g = goldDifference(reduceState(emptyState(), game({ positions: false })))!;
    expect(g.pairedBy).toBe("order");
    expect(g.rows[0]!.ally.champion).toBe("Ahri");
  });
});

describe("objectives", () => {
  it("credits monsters to the killer's team and structures to the team that destroyed them", () => {
    const s = reduceState(emptyState(), game({
      events: [
        { EventID: 1, EventName: "DragonKill", EventTime: 300, KillerName: "Garen#NA1", DragonType: "Fire" },
        { EventID: 2, EventName: "DragonKill", EventTime: 600, KillerName: "Darius#NA1", DragonType: "Water" },
        { EventID: 3, EventName: "HeraldKill", EventTime: 700, KillerName: "Syndra#NA1" },
        { EventID: 4, EventName: "TurretKilled", EventTime: 800, TurretKilled: "Turret_T2_L_03_A", KillerName: "Minion_T100" },
        { EventID: 5, EventName: "TurretKilled", EventTime: 850, TurretKilled: "Turret_T1_C_05_A", KillerName: "Syndra#NA1" },
        { EventID: 6, EventName: "BaronKill", EventTime: 880, KillerName: "SRU_Baron" },
      ],
    }));
    expect(objectives(s)).toEqual({
      ally: { dragons: ["Fire"], heralds: 0, barons: 0, turrets: 1, inhibitors: 0 },
      enemy: { dragons: ["Water"], heralds: 1, barons: 0, turrets: 1, inhibitors: 0 },
    });
  });
});

describe("actual equipped loadout",()=>{
 it("reads only own spells and deduplicates the reported keystone",()=>{
  const data=game();
  data.activePlayer.fullRunes={keystone:{id:8112,displayName:"Electrocute"},generalRunes:[{id:8112,displayName:"Electrocute"},{id:8143,displayName:"Sudden Impact"}],statRunes:[{id:5008}]};
  data.allPlayers[0]!.summonerSpells={summonerSpellOne:{displayName:"Flash"},summonerSpellTwo:{displayName:"Ignite"}};
  data.allPlayers[2]!.summonerSpells={summonerSpellOne:{displayName:"Teleport"}};
  expect(reduceState(emptyState(),data).loadout).toEqual({runes:[{id:8112,name:"Electrocute"},{id:8143,name:"Sudden Impact"},{id:5008,name:"Rune 5008"}],spells:["Flash","Ignite"]});
 });
 it("reports unavailable when actual data is missing",()=>{
  expect(reduceState(emptyState(),game()).loadout).toBeNull();
 });
});


describe("reported player loadouts", () => {
  it("keeps each player's reported spells and runes without inventing missing loadouts", () => {
    const data=game();
    data.allPlayers[2]!.summonerSpells={summonerSpellOne:{displayName:"Flash"},summonerSpellTwo:{displayName:"Teleport"}};
    data.allPlayers[2]!.runes={keystone:{id:8112,displayName:"Electrocute"}};
    const state=reduceState(emptyState(),data);
    expect(state.enemies[0]!.spells).toEqual(["Flash","Teleport"]);
    expect(state.enemies[0]!.runes).toEqual([{id:8112,name:"Electrocute"}]);
    expect(state.me!.spells).toEqual([]);
    expect(state.me!.runes).toEqual([]);
  });
});
