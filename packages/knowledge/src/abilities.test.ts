import { describe, expect, it } from "vitest";
import { fetchChampionAbilities, parseChampionAbilities, plainText } from "./abilities.js";

const spell = (id: string, name: string, cd: string) => ({ id, name, description: `Deals <magicDamage>damage</magicDamage>.<br>Then more.`, cooldownBurn: cd, costBurn: "0", rangeBurn: "880", image: { full: `${id}.png` } });
const file = {
  version: "16.19.1",
  data: {
    Ahri: {
      id: "Ahri", name: "Ahri", allytips: ["Use <b>Charm</b> first."], enemytips: [],
      passive: { name: "Essence Theft", description: "Heals after <i>kills</i>.", image: { full: "Ahri_SoulEater2.png" } },
      spells: [spell("AhriQ", "Orb of Deception", "7"), spell("AhriW", "Fox-Fire", "9/8/7/6/5"), spell("AhriE", "Charm", "14"), spell("AhriR", "Spirit Rush", "130/105/80")],
    },
  },
};

describe("champion abilities", () => {
  it("reads the passive and Q/W/E/R as plain text with Riot's per-rank values", () => {
    const a = parseChampionAbilities(file);
    expect(a.abilities.map((x) => x.key)).toEqual(["P", "Q", "W", "E", "R"]);
    expect(a.abilities[1]).toMatchObject({ name: "Orb of Deception", cooldown: "7", cost: null, range: "880", description: "Deals damage. Then more." });
    expect(a.abilities[4]!.cooldown).toBe("130/105/80");
    expect(a.allyTips).toEqual(["Use Charm first."]);
    expect(plainText("a<br/>b")).toBe("a b");
  });

  it("returns null for bad ids or a failed download, and retries later", async () => {
    let calls = 0;
    const failing = (async () => { calls++; return new Response("nope", { status: 500 }); }) as typeof fetch;
    expect(await fetchChampionAbilities("16.19.1", "../etc", failing)).toBeNull();
    expect(calls).toBe(0);
    expect(await fetchChampionAbilities("16.19.1", "Ahri", failing)).toBeNull();
    const ok = (async () => new Response(JSON.stringify(file))) as typeof fetch;
    expect((await fetchChampionAbilities("16.19.1", "Ahri", ok))?.abilities).toHaveLength(5);
  });
});
