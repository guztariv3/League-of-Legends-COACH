import { describe, expect, it } from "vitest";
import { search, type SearchIndex } from "./search.js";

const index: SearchIndex = {
  champions: [
    { id: "MonkeyKing", name: "Wukong" },
    { id: "LeeSin", name: "Lee Sin" },
    { id: "Zed", name: "Zed" },
  ],
  playerChampions: new Map([["LeeSin", 20]]),
  matchups: new Map([["LeeSin|Zed", 4]]),
  dimensions: [{ id: "lane", label: "Fase de líneas", headline: "Oro al 10: +200" }],
  insights: [],
};

describe("search with champion ids that differ from display names", () => {
  it("matches display names but filters and counts by Riot id", () => {
    const vs = search("lee sin vs zed", index);
    expect(vs[0]).toMatchObject({ type: "matchup", title: "Lee Sin contra Zed", href: "/matches?champion=LeeSin&opponent=Zed" });
    expect(vs[0]!.subtitle).toContain("4 partidas");
    const champ = search("lee sin", index).find((r) => r.type === "champion")!;
    expect(champ).toMatchObject({ title: "Lee Sin", subtitle: "20 partidas tuyas", href: "/champions/LeeSin" });
    expect(search("wuk", index)[0]).toMatchObject({ title: "Wukong", href: "/champions/MonkeyKing" });
    expect(search("mis ultimas 5 partidas con wukong", index).find((r) => r.type === "matches")!.href).toBe("/matches?champion=MonkeyKing&limit=5");
  });
});

describe("search: evolution topics", () => {
  it("links evolution and adaptation questions to the profile", () => {
    expect(search("¿estoy mejorando?", index).some((r) => r.href === "/profile#evolution")).toBe(true);
    expect(search("como me adapto", index).some((r) => r.href === "/profile#adaptation")).toBe(true);
  });
});
