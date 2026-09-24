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
