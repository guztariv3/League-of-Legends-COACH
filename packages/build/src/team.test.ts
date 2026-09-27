import { describe, expect, it } from "vitest";
import { parseChampionKits } from "@coach/knowledge";
import { gameData } from "@coach/knowledge/test-data";
import { championProfile, FRONTLINE, teamNeeds } from "./index.js";

// Properties on the real patch data, not a list of expected champions.
const data = gameData();
const kits = parseChampionKits(data.ddragonChampions, data.merakiChampions);
const kit = (id: string) => kits.find((k) => k.id === id)!;
const front = (id: string) => championProfile(kit(id)).frontline >= FRONTLINE;

describe("what your team needs", () => {
  it("says nothing until at least three allies are known", () => {
    expect(teamNeeds(kit("Ahri"), [kit("Jinx"), kit("Lux")])).toEqual([]);
  });

  it("no frontline among the allies: a frontline kit is told it is the frontline; a squishy one is told to fight after the engage", () => {
    const squishy = ["Jinx", "Lux", "Caitlyn", "Xerath", "Ezreal", "Syndra"].filter((id) => !front(id)).slice(0, 4).map(kit);
    expect(squishy.length).toBe(4);
    const tanky = ["Malphite", "Leona", "Ornn", "Sion"].find(front)!;
    expect(teamNeeds(kit(tanky), squishy).map((n) => n.id)).toContain("frontline-you");
    const ahri = teamNeeds(kit("Ahri"), squishy);
    if (!front("Ahri")) expect(ahri.map((n) => n.id)).toContain("frontline-none");
  });

  it("with a frontline ally there is no frontline note", () => {
    const tanky = ["Malphite", "Leona", "Ornn", "Sion"].find(front)!;
    expect(teamNeeds(kit("Ahri"), [kit(tanky), kit("Jinx"), kit("Lux")]).some((n) => n.id.startsWith("frontline"))).toBe(false);
  });

  it("names a one-sided damage mix, with the share, and says why it matters", () => {
    const ad = ["Jinx", "Caitlyn", "Zed", "Talon", "Draven", "Riven", "Darius"].filter((id) => championProfile(kit(id)).damage.magic < 0.15);
    const notes = teamNeeds(kit(ad[0]!), ad.slice(1, 5).map(kit));
    const n = notes.find((x) => x.id === "damage-physical");
    expect(n?.text).toMatch(/\(\d+% magic\)/);
    expect(n?.why).toMatch(/armor/);
    // A mixed team gets no damage note.
    expect(teamNeeds(kit("Ahri"), [kit("Jinx"), kit("Leona"), kit("Zed")]).some((x) => x.id.startsWith("damage"))).toBe(false);
  });
});
