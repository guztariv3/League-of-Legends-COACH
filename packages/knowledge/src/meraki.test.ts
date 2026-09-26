import { describe, expect, it } from "vitest";
import { parseWikiChampion, parseWikiChampions, wikiSource } from "./meraki.js";

// Shape of Meraki's lolstaticdata champion JSON (camelCase dataclasses), trimmed.
const ahri = {
  id: 103, key: "Ahri", name: "Ahri", title: "the Nine-Tailed Fox", resource: "MANA", attackType: "RANGED", adaptiveType: "MAGIC_DAMAGE",
  positions: ["MIDDLE"], roles: ["BURST", "MAGE"],
  attributeRatings: { damage: 3, toughness: 1, control: 2, mobility: 3, utility: 1, abilityReliance: 100, difficulty: 2 },
  abilities: {
    P: [{ name: "Essence Theft", blurb: "Ahri heals after takedowns.", effects: [{ description: "Innate: heals.", leveling: [] }], cost: null, cooldown: null }],
    Q: [{
      name: "Orb of Deception", damageType: "MAGIC_DAMAGE", targeting: "Direction",
      effects: [{ description: "Ahri sends out an orb.", leveling: [{ attribute: "Magic Damage", modifiers: [
        { values: [40, 65, 90, 115, 140], units: ["", "", "", "", ""] },
        { values: [45, 45, 45, 45, 45], units: ["% AP", "% AP", "% AP", "% AP", "% AP"] },
      ] }] }],
      cost: { modifiers: [{ values: [55, 65, 75, 85, 95], units: ["", "", "", "", ""] }] },
      cooldown: { modifiers: [{ values: [7, 7, 7, 7, 7], units: ["", "", "", "", ""] }], affectedByCdr: true },
    }],
    W: [], E: [], R: [{ name: "Spirit Rush", effects: [] }, { name: null }],
  },
  patchLastChanged: "26.18",
};

describe("wiki champion data (Meraki)", () => {
  it("reduces a champion to what the app shows, in the Wiki's number style", () => {
    const c = parseWikiChampion(ahri)!;
    expect(c).toMatchObject({ key: "Ahri", positions: ["MIDDLE"], roles: ["BURST", "MAGE"], attackType: "Ranged", adaptiveType: "Magic damage" });
    expect(c.ratings).toMatchObject({ damage: 3, toughness: 1, mobility: 3 });
    const q = c.abilities.find((a) => a.key === "Q")!;
    expect(q.effects[0]!.values[0]).toEqual({ label: "Magic Damage", value: "40 / 65 / 90 / 115 / 140 (+ 45% AP)" });
    expect(q.cooldown).toBe("7");
    expect(q.cost).toBe("55 / 65 / 75 / 85 / 95");
    expect(q.damageType).toBe("Magic damage");
    expect(c.abilities.map((a) => a.key)).toEqual(["P", "Q", "R"]); // the nameless R entry is dropped
  });

  it("skips malformed entries instead of guessing", () => {
    const m = parseWikiChampions({ Ahri: ahri, Broken: { name: "No key" }, Weird: 7 });
    expect([...m.keys()]).toEqual(["Ahri"]);
    expect(parseWikiChampion({ ...ahri, attributeRatings: { damage: 3 } })!.ratings).toBeNull();
  });

  it("downloads once, shares concurrent calls, keeps the last good copy and retries later", async () => {
    let calls = 0, fail = false;
    let t = 0;
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`C${i}`, { ...ahri, key: `C${i}`, name: `C${i}` }]));
    const fetchImpl = (async () => { calls++; if (fail) throw new Error("down"); return new Response(JSON.stringify(many)); }) as unknown as typeof fetch;
    const src = wikiSource({ fetchImpl, now: () => t, ttlMs: 1000, retryMs: 100 });
    const [a, b] = await Promise.all([src.get(), src.get()]);
    expect(calls).toBe(1);
    expect(a!.size).toBe(60);
    expect(b).toBe(a);
    fail = true; t = 2000;
    expect((await src.get())!.size).toBe(60); // refresh fails in the background; the copy stays
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
    t = 2050; await src.get(); expect(calls).toBe(2); // within retry window
  });

  it("returns null (not an error) when the source is down and nothing was cached", async () => {
    const src = wikiSource({ fetchImpl: (async () => new Response("", { status: 503 })) as unknown as typeof fetch });
    expect(await src.get()).toBeNull();
  });
});
