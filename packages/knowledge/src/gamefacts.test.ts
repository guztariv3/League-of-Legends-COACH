import { describe, expect, it } from "vitest";
import { gameFactsSource } from "./gamefacts.js";
import { gameData } from "./test-data.js";

const data = gameData();
const version = data.meta.ddragonVersion;

function fakeFetch(fail = false) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    if (fail) return new Response("no", { status: 503 });
    const body = url.endsWith("item.json") && url.includes("ddragon") ? data.ddragonItems
      : url.endsWith("championFull.json") ? data.ddragonChampions
      : url.endsWith("summoner.json") ? data.summoners
      : url.endsWith("perkstyles.json") ? data.perkStyles
      : url.endsWith("perks.json") ? data.perks
      : url.endsWith("items.json") ? data.merakiItems
      : data.merakiChampions;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("game facts source", () => {
  it("downloads Data Dragon and Meraki for the active patch, once, and parses them", async () => {
    const f = fakeFetch();
    const src = gameFactsSource({ version: () => version, fetchImpl: f.impl });
    const a = await src.get();
    expect(a?.version).toBe(version);
    expect(a!.items.some((i) => i.purchasable && i.detail === "full")).toBe(true);
    expect(a!.kits.length).toBeGreaterThan(100);
    expect(a!.runes.trees).toHaveLength(5);
    expect(a!.spells.some((s) => s.name === "Flash")).toBe(true);
    await src.get();
    expect(f.calls).toHaveLength(7);
    expect(f.calls.filter((u) => u.includes(`/cdn/${version}/data/en_US/`))).toHaveLength(3);
  });

  it("refetches when the patch changes, and keeps the last good copy when a download fails", async () => {
    let v = version;
    let fail = false;
    const ok = fakeFetch();
    const bad = fakeFetch(true);
    let t = 0;
    const src = gameFactsSource({ version: () => v, now: () => t, fetchImpl: ((u: string) => (fail ? bad.impl(u) : ok.impl(u))) as unknown as typeof fetch });
    expect((await src.get())?.version).toBe(version);
    v = "99.1.1";
    fail = true;
    t += 1000;
    expect((await src.get())?.version).toBe(version); // failed: the previous patch's copy stays
    expect(bad.calls.length).toBeGreaterThan(0);
  });

  it("returns null without an active patch", async () => {
    expect(await gameFactsSource({ version: () => null, fetchImpl: fakeFetch().impl }).get()).toBeNull();
  });
});
