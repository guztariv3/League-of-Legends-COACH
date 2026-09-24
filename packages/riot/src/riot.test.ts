import { describe, expect, it } from "vitest";
import { generateHistory } from "@coach/synthetic";
import { RiotClient, RiotApiError } from "./client.js";
import { parseLimitHeader, RateLimiter } from "./rate-limiter.js";

function fakeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms: number) => { t += ms; },
    get time() { return t; },
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("rate limiter", () => {
  it("parses Riot limit headers", () => {
    expect(parseLimitHeader("20:1,100:120")).toEqual([{ limit: 20, seconds: 1 }, { limit: 100, seconds: 120 }]);
    expect(parseLimitHeader("bad")).toBeNull();
    expect(parseLimitHeader(null)).toBeNull();
  });

  it("delays once a window is full", () => {
    const clock = fakeClock();
    const rl = new RateLimiter(clock.now, [{ limit: 2, seconds: 1 }]);
    const keys = [{ key: "a" }];
    expect(rl.delayFor(keys)).toBe(0);
    rl.record(["a"]);
    rl.record(["a"]);
    expect(rl.delayFor(keys)).toBeGreaterThan(0);
    clock.sleep(1001);
    expect(rl.delayFor(keys)).toBe(0);
  });
});

describe("RiotClient", () => {
  const [game] = generateHistory({ seed: 1, puuid: "p", gameName: "G", tagLine: "T", platform: "euw1", count: 1 });

  it("uses the regional route and API key header, and validates responses", async () => {
    const calls: { url: string; token: string | null }[] = [];
    const client = new RiotClient({
      apiKey: "RGAPI-test",
      fetch: async (url, init) => {
        calls.push({ url: String(url), token: new Headers(init?.headers).get("X-Riot-Token") });
        return json(game!.match, 200, { "X-App-Rate-Limit": "20:1,100:120" });
      },
    });
    const m = await client.getMatch("euw1", game!.match.metadata.matchId);
    expect(m?.metadata.matchId).toBe(game!.match.metadata.matchId);
    expect(calls[0]!.url).toMatch(/^https:\/\/europe\.api\.riotgames\.com\/lol\/match\/v5\/matches\//);
    expect(calls[0]!.token).toBe("RGAPI-test");
  });

  it("returns null on 404 for lookups", async () => {
    const client = new RiotClient({ apiKey: "k", fetch: async () => json({}, 404) });
    expect(await client.getAccountByRiotId("na1", "Nobody", "NA1")).toBeNull();
  });

  it("honours Retry-After on 429 and then succeeds", async () => {
    const clock = fakeClock();
    let n = 0;
    const client = new RiotClient({
      apiKey: "k",
      now: clock.now,
      sleep: clock.sleep,
      fetch: async () => (n++ === 0 ? json({}, 429, { "Retry-After": "3" }) : json(["EUW1_1"])),
    });
    const start = clock.time;
    expect(await client.getMatchIds("euw1", "p", { count: 5 })).toEqual(["EUW1_1"]);
    expect(clock.time - start).toBeGreaterThanOrEqual(3000);
  });

  it("raises auth errors without retrying", async () => {
    let n = 0;
    const client = new RiotClient({ apiKey: "k", fetch: async () => { n++; return json({}, 403); } });
    await expect(client.getMatch("euw1", "EUW1_1")).rejects.toMatchObject({ kind: "auth" });
    expect(n).toBe(1);
  });

  it("rejects payloads that do not match the schema", async () => {
    const client = new RiotClient({ apiKey: "k", fetch: async () => json({ unexpected: true }) });
    await expect(client.getMatch("euw1", "EUW1_1")).rejects.toBeInstanceOf(RiotApiError);
  });

  it("refuses unknown platforms", async () => {
    const client = new RiotClient({ apiKey: "k", fetch: async () => json([]) });
    await expect(client.getMatchIds("xx9", "p")).rejects.toMatchObject({ kind: "bad_request" });
  });
});
