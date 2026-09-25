import { describe, expect, it } from "vitest";
import { dataDragonSource, fetchBundle, KnowledgeRegistry, syntheticSource, validateBundle, type KnowledgeBundle } from "./index.js";

describe("knowledge pipeline", () => {
  it("loads the synthetic catalog through the Data Dragon-shaped parser", async () => {
    const b = await fetchBundle(syntheticSource());
    expect(b.source).toBe("synthetic");
    expect(b.champions.length).toBeGreaterThan(5);
    expect(validateBundle(b).ok).toBe(true);
  });

  it("uses Data Dragon CDN paths and rejects version mismatches", async () => {
    const urls: string[] = [];
    const fake: typeof fetch = async (url) => {
      urls.push(String(url));
      if (String(url).endsWith("versions.json")) return new Response(JSON.stringify(["99.1.1"]));
      return new Response(JSON.stringify({ version: "99.0.0", data: {} }));
    };
    await expect(fetchBundle(dataDragonSource(fake))).rejects.toThrow(/Version mismatch/);
    expect(urls[1]).toBe("https://ddragon.leagueoflegends.com/cdn/99.1.1/data/en_US/champion.json");
  });

  it("reads summoner spells and runes, and a broken icon feed never rejects the bundle", async () => {
    const champ = { version: "9.9.9", data: { Ahri: { id: "Ahri", key: "103", name: "Ahri", title: "t", tags: ["Mage"] } } };
    const items = { version: "9.9.9", data: { "1001": { name: "Boots", gold: { total: 300 } } } };
    const spells = { version: "9.9.9", data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash" } } };
    const runes = [{ id: 8100, key: "Domination", name: "Domination", icon: "perk-images/Styles/7200_Domination.png",
      slots: [{ runes: [{ id: 8112, key: "Electrocute", name: "Electrocute", icon: "perk-images/Styles/Domination/Electrocute/Electrocute.png" }] }] }];
    const serve = (brokenRunes: boolean): typeof fetch => async (url) => {
      const u = String(url);
      if (u.endsWith("versions.json")) return new Response(JSON.stringify(["9.9.9"]));
      if (u.endsWith("champion.json")) return new Response(JSON.stringify(champ));
      if (u.endsWith("item.json")) return new Response(JSON.stringify(items));
      if (u.endsWith("summoner.json")) return new Response(JSON.stringify(spells));
      if (u.endsWith("runesReforged.json")) return brokenRunes ? new Response("nope", { status: 500 }) : new Response(JSON.stringify(runes));
      return new Response("?", { status: 404 });
    };
    const b = await fetchBundle(dataDragonSource(serve(false)));
    expect(b.spells).toEqual([{ key: 4, id: "SummonerFlash", name: "Flash" }]);
    expect(b.runes).toEqual([
      { id: 8100, name: "Domination", icon: "perk-images/Styles/7200_Domination.png", style: true },
      { id: 8112, name: "Electrocute", icon: "perk-images/Styles/Domination/Electrocute/Electrocute.png", style: false },
    ]);
    const degraded = await fetchBundle(dataDragonSource(serve(true)));
    expect(degraded.runes).toEqual([]);
    expect(degraded.champions).toHaveLength(1);
  });

  it("activates valid bundles, rejects broken ones and rolls back", async () => {
    const reg = new KnowledgeRegistry();
    const good = await fetchBundle(syntheticSource());
    expect(reg.install(good).ok).toBe(true);

    const broken: KnowledgeBundle = { ...good, version: "broken", champions: good.champions.slice(0, 2) };
    const res = reg.install(broken);
    expect(res.ok).toBe(false);
    expect(reg.active()?.version).toBe(good.version);
    expect(reg.status("broken")?.status).toBe("rejected");

    const next: KnowledgeBundle = { ...good, version: "next" };
    reg.install(next);
    expect(reg.active()?.version).toBe("next");
    expect(reg.rollback()?.version).toBe(good.version);
    expect(reg.champion(9001)?.name).toBe("Aurelith");
  });
});

describe("re-ingesting the active version", () => {
  it("keeps the active bundle when a same-version re-ingest fails validation", async () => {
    const reg = new KnowledgeRegistry();
    const good = await fetchBundle(syntheticSource());
    reg.install(good);
    const broken: KnowledgeBundle = { ...good, champions: [] };
    expect(reg.install(broken).ok).toBe(false);
    expect(reg.active()?.champions.length).toBe(good.champions.length);
  });
});
