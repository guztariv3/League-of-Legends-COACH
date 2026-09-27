import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseChampionKits, parseItems, parseRunes, parseSummonerSpells, syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { gameData } from "@coach/knowledge/test-data";
import { patchFromVersion } from "@coach/domain";
import { recordGame } from "./stats/store.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase, schema, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { syntheticSource } from "./sources.js";

let database: Database;
let ctx: ReturnType<typeof createApp>;

beforeAll(async () => {
  database = await openDatabase(undefined, undefined);
  const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
  // The build engine's facts: the real game data snapshot (the synthetic catalog has fictional champions).
  const d = gameData();
  const facts = {
    version: d.meta.ddragonVersion, items: parseItems(d.ddragonItems, d.merakiItems), kits: parseChampionKits(d.ddragonChampions, d.merakiChampions),
    runes: parseRunes(d.perks, d.perkStyles), spells: parseSummonerSpells(d.summoners),
  };
  const gameFacts = { get: async () => facts };
  ctx = createApp({ cfg: loadConfig({ NODE_ENV: "test" }), db: database.db, source: syntheticSource(() => Date.UTC(2026, 5, 1)), knowledge, aiProviders: [], gameFacts });
}, 30_000);
afterAll(() => database.close());

async function call(path: string, init: RequestInit & { cookie?: string; ip?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("Cookie", init.cookie);
  headers.set("X-Forwarded-For", init.ip ?? "10.0.0.1");
  const res = await ctx.app.request(`/api${path}`, { ...init, headers });
  return { res, body: (await res.json()) as any };
}

async function player(name: string) {
  const { res } = await call("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName: name }) });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: name, tagLine: "EUW", platform: "euw1" }) });
  return cookie;
}

const claim = (code: string, ip = "10.0.0.1") => call("/desktop/claim", { method: "POST", ip, body: JSON.stringify({ code, label: "Test PC" }) });
const scout = (token: string) => call("/desktop/scout", { headers: { Authorization: `Bearer ${token}` } });

describe("desktop pairing", () => {
  it("pairs with a one-time code, scouts with the device token and can be revoked", async () => {
    const cookie = await player("DeskPlayer");
    expect((await call("/desktop/pair", { method: "POST", body: "{}" })).res.status).toBe(401);

    const pair = await call("/desktop/pair", { method: "POST", cookie, body: "{}" });
    expect(pair.res.status).toBe(201);
    expect(pair.body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // Lower-case and without the dash still works (people type it by hand).
    const c = await claim(pair.body.code.toLowerCase().replace("-", ""));
    expect(c.res.status).toBe(200);
    const token = c.body.token as string;
    expect(token.length).toBeGreaterThan(30);

    // Single use.
    expect((await claim(pair.body.code)).res.status).toBe(401);

    // Only hashes are stored.
    const rows = await database.db.select().from(schema.deviceLinks);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain(pair.body.code);

    const s = await scout(token);
    expect(s.res.status).toBe(200);
    expect(s.body).toHaveProperty("inGame");
    expect(s.body.assets).toEqual({ cdn: null, version: expect.any(String) });

    // The token only opens /desktop/scout, never the web session routes.
    expect((await call("/me", { headers: { Authorization: `Bearer ${token}` } })).res.status).toBe(401);

    const devices = await call("/desktop/devices", { cookie });
    expect(devices.body.devices).toHaveLength(1);
    expect(devices.body.devices[0].label).toBe("Test PC");
    expect(devices.body.devices[0].lastUsedAt).toBeTruthy();

    // Another player cannot revoke it.
    const other = await player("DeskOther");
    expect((await call(`/desktop/devices/${devices.body.devices[0].id}`, { method: "DELETE", cookie: other })).res.status).toBe(404);

    expect((await call(`/desktop/devices/${devices.body.devices[0].id}`, { method: "DELETE", cookie })).res.status).toBe(200);
    expect((await scout(token)).res.status).toBe(401);
    expect((await call("/desktop/devices", { cookie })).body.devices).toHaveLength(0);
  }, 60_000);

  it("gives the player's own build with a champion, from their history only", async () => {
    const cookie = await player("DeskBuilder");
    const me = await call("/me", { cookie });
    await ctx.sync.start(me.body.accounts[0].id);
    const pair = await call("/desktop/pair", { method: "POST", cookie, body: "{}" });
    const token = (await claim(pair.body.code, "10.0.0.3")).body.token as string;
    const auth = { Authorization: `Bearer ${token}` };

    // The champion this player has played most on Summoner's Rift.
    const matches = (await call("/matches?mode=summoners_rift&limit=100", { cookie })).body.matches as { championName: string }[];
    const counts = new Map<string, number>();
    for (const m of matches) counts.set(m.championName, (counts.get(m.championName) ?? 0) + 1);
    const [main, played] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;

    const build = await call(`/desktop/build?champion=${main}&mode=summoners_rift`, { headers: auth });
    expect(build.res.status).toBe(200);
    expect(build.body.games).toBe(played);
    expect(played).toBeGreaterThanOrEqual(3);
    expect(build.body.items.length).toBeGreaterThan(0);
    for (const i of build.body.items) {
      expect(i.games).toBeGreaterThanOrEqual(2);
      expect(i.games).toBeLessThanOrEqual(played);
      expect(i.wins).toBeLessThanOrEqual(i.games);
    }
    // Levelling orders from the timelines feed the live skill advisor.
    expect(build.body.skillOrders.length).toBeGreaterThanOrEqual(3);
    expect(build.body.skillOrders[0].slice(0, 6)).toEqual([1, 2, 3, 1, 1, 4]);

    const none = await call("/desktop/build?champion=NoSuchChampion&mode=summoners_rift", { headers: auth });
    expect(none.body).toMatchObject({ games: 0, items: [], skillOrders: [] });
    expect(none.body.note).toContain("You have no games");

    expect((await call("/desktop/build?champion=../x&mode=summoners_rift", { headers: auth })).res.status).toBe(400);
    expect((await call(`/desktop/build?champion=${main}&mode=summoners_rift`)).res.status).toBe(401);

    // The Coach's game plan for the game that starts: champions only.
    const plan = await call(`/desktop/plan?me=${main}&allies=Brannoc,Sylvaine&enemies=Korvane,Dravok,Ilsa&opponent=Korvane`, { headers: auth });
    expect(plan.res.status).toBe(200);
    expect(plan.body.plan.enemyPowerSpike.text).toBe("Korvane: level 6 and their first completed item");
    expect(plan.body.plan.loadout.games).toBe(played);
    expect(plan.body.keyPoints.length).toBeGreaterThan(0);
    // Champion select sends numeric keys: they map to the same champions (Aurelith = 9001, Korvane = 9002, Brannoc = 9003).
    const byKey = await call(`/desktop/plan?me=9001&allies=9003&enemies=9002`, { headers: auth });
    expect(byKey.res.status).toBe(200);
    expect(byKey.body.champion).toBe("Aurelith");
    expect((await call(`/desktop/plan?me=424242`, { headers: auth })).res.status).toBe(400);
    expect((await call("/desktop/plan?me=../x", { headers: auth })).res.status).toBe(400);
    expect((await call(`/desktop/plan?me=${main}&enemies=a,b,c,d,e,f`, { headers: auth })).res.status).toBe(400);
    expect((await call(`/desktop/plan?me=${main}`)).res.status).toBe(401);
    // Champions the build data doesn't know (the synthetic ones) get no build rather than a guess.
    expect(plan.body.build).toBeNull();

    // The pre-game build for real champions: starting items, first item with its reasons, rule-outs.
    const tank = await call("/desktop/plan?me=Malphite&enemies=Syndra,Brand,Lux,Veigar,Annie&opponent=Syndra&position=top", { headers: auth });
    expect(tank.res.status).toBe(200);
    expect(tank.body.build.champion).toBe("Malphite");
    expect(tank.body).toHaveProperty("memory"); // phase 5: patterns from the player's games (or null)
    expect(tank.body.build.enemiesKnown).toBe(5);
    expect(tank.body.build.starter.items.length).toBeGreaterThan(0);
    expect(tank.body.build.first.why.length).toBeGreaterThan(0);
    expect(tank.body.build.enemyDamage.magic).toBeGreaterThan(0.8);
    expect(tank.body.build.attribution.license).toContain("creativecommons");
    expect(tank.body.build.setup.runes.keystone.why.length).toBeGreaterThan(0);
    expect(tank.body.build.setup.spells).toHaveLength(2);
    expect(JSON.stringify([tank.body.build.first, ...tank.body.build.next, ...tank.body.build.situational])).not.toContain("Randuin");
    expect((await call("/desktop/plan?me=Malphite&position=mid", { headers: auth })).res.status).toBe(400);
    // What the team needs: with only squishy allies, the frontline kit hears it is the frontline.
    expect(tank.body.build.team).toEqual([]); // no allies known yet
    const withTeam = await call("/desktop/plan?me=Malphite&allies=Jinx,Lux,Xerath,Caitlyn&enemies=Syndra&position=top", { headers: auth });
    expect(withTeam.body.build.team.map((n: { id: string }) => n.id)).toContain("frontline-you");

    // Master+ statistics (phase 4): nothing until the sample is large enough, then labelled evidence.
    expect(tank.body.build.stats).toBeNull();
    const patch = patchFromVersion(tank.body.build.version);
    const common = tank.body.build.first.id === 3068 ? 3075 : 3068;
    for (let i = 0; i < 40; i++) {
      const win = i % 5 < 3;
      await recordGame(database.db, { matchId: `EUW1_M${i}`, platform: "EUW1", patch, counted: true, rows: [
        { champion: "Malphite", position: "TOP", kind: "games", key: "", win, minute: null },
        { champion: "Malphite", position: "TOP", kind: "first_item", key: String(common), win, minute: 12 },
        { champion: "Malphite", position: "TOP", kind: "keystone", key: "8437:8300", win, minute: null },
        { champion: "Malphite", position: "TOP", kind: "spells", key: "4+12", win, minute: null },
        { champion: "Malphite", position: "TOP", kind: "skill_max", key: "Q>E>W", win, minute: null },
        { champion: "Malphite", position: "TOP", kind: "skill_seq", key: "1,3,2,1,1,4,1,3,1", win, minute: null },
        ...(i < 12 ? [{ champion: "Malphite", position: "TOP", kind: "matchup" as const, key: "Syndra", win: i % 2 === 0, minute: null }] : []),
      ] });
    }
    const withStats = (await call("/desktop/plan?me=Malphite&enemies=Syndra,Brand,Lux,Veigar,Annie&opponent=Syndra&position=top", { headers: auth })).body.build;
    expect(withStats.first.id).toBe(tank.body.build.first.id); // the statistics never change the engine's pick
    const st = withStats.stats;
    expect(st).toMatchObject({ patch, patchLabel: "current", position: "TOP", games: 40 });
    expect(st.firstItem).toMatchObject({ id: common, games: 40, avgMinute: 12 });
    expect(st.keystone.name).toBe("Grasp of the Undying");
    expect(st.spells.names).toEqual(["Flash", "Teleport"]);
    expect(st.skills).toMatchObject({ max: ["Q", "E", "W"], sequence: [1, 3, 2, 1, 1, 4, 1, 3, 1] });
    expect(st.matchup).toEqual({ opponent: "Syndra", games: 12, winRate: 0.5 });
    // The coach says when it suggests something else, and why; a win rate never decides.
    expect(st.notes.join(" ")).toMatch(new RegExp(`the coach suggests ${withStats.first.name}`));
    expect(st.notes.join(" ")).toMatch(/doesn't decide your build/);
    // Without a position: the champion's most played position that patch.
    expect((await call("/desktop/plan?me=Malphite", { headers: auth })).body.build.stats.position).toBe("TOP");

    // During the game: the same engine with the items and scores the game shows.
    const mid = (enemies: string, mine = "3068") => call(`/desktop/items?me=Malphite&mine=${mine}&enemies=${enemies}&opponent=Syndra&position=top`, { headers: auth });
    const apTeam = "Syndra~3157~2~1,Brand~6653~1~0,Lux~~0~2,Veigar~~0~0,Annie~~1~1";
    const vsAp = await mid(apTeam);
    expect(vsAp.res.status).toBe(200);
    expect(vsAp.body.build.starter).toBeNull();
    expect(vsAp.body.build.first.id).not.toBe(3068); // owned items are not suggested again
    expect(JSON.stringify(vsAp.body.build)).not.toMatch(/"name":"Randuin's Omen"[^}]*"score"/); // no enemy crit: never recommended
    // Enemy crit items show up as a crit threat that names the item source.
    const vsCrit = await mid("Tryndamere~3031.3006~5~1,Jinx~3031~3~0,Yasuo~~1~1,MasterYi~~0~0,Soraka~~0~0");
    const crit = vsCrit.body.build.threats.find((t: { kind: string }) => t.kind === "crit");
    expect(crit.sources[0].why).toMatch(/critical strike chance from items/);
    // Starting items when asked at the start of the game.
    const opening = await call(`/desktop/items?me=Malphite&mine=&enemies=${apTeam}&position=top&opening=1`, { headers: auth });
    expect(opening.body.build.starter.items.length).toBeGreaterThan(0);
    for (const bad of ["me=../x", "me=Malphite&enemies=Zed~1~a~0", "me=Malphite&mine=1.2.3.4.5.6.7.8.9.10.11", "me=Malphite&position=mid"]) {
      expect((await call(`/desktop/items?${bad}`, { headers: auth })).res.status, bad).toBe(400);
    }
    expect((await call("/desktop/items?me=Malphite")).res.status).toBe(401);

    // Home between games: the same profile as the website, only with the device token.
    const home = await call("/desktop/home", { headers: auth });
    expect(home.res.status).toBe(200);
    expect(home.body.accounts.length).toBeGreaterThan(0);
    expect(home.body.record.wins).toBeLessThanOrEqual(home.body.record.games);
    expect(home.body.recent.length).toBeGreaterThan(0);
    expect(home.body.champions.length).toBeGreaterThan(0);
    expect((await call("/desktop/home")).res.status).toBe(401);
  }, 60_000);

  it("rejects wrong, expired and malformed codes and tokens", async () => {
    const cookie = await player("DeskExpired");
    const pair = await call("/desktop/pair", { method: "POST", cookie, body: "{}" });
    await database.db.update(schema.deviceLinks).set({ codeExpiresAt: new Date(Date.now() - 1000) });
    expect((await claim(pair.body.code, "10.0.0.2")).res.status).toBe(401);
    expect((await claim("ZZZZ-ZZZZ", "10.0.0.2")).res.status).toBe(401);
    expect((await call("/desktop/claim", { method: "POST", ip: "10.0.0.2", body: "{}" })).res.status).toBe(400);
    expect((await scout("not-a-real-token-but-long-enough")).res.status).toBe(401);
    expect((await call("/desktop/scout")).res.status).toBe(401);
  });

  it("rate-limits code guessing per address", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await claim("AAAA-AAAA", "10.9.9.9")).res.status;
    expect(last).toBe(429);
    // A forged left-most X-Forwarded-For entry does not reset the limit.
    expect((await claim("AAAA-AAAA", "1.2.3.4, 10.9.9.9")).res.status).toBe(429);
  });
});


describe("private Live companion frames",()=>{
 it("requires device authorization, orders updates, isolates users and revokes access",async()=>{
  const cookie=await player("LiveOwner"), other=await player("LiveOther");
  const pair=await call("/desktop/pair",{method:"POST",cookie,body:"{}"});
  const linked=await claim(pair.body.code,"10.0.0.77"), token=linked.body.token;
  const frame={version:1,streamId:"b17e6721-1325-4452-91ac-361f8a536bb8",sequence:1,capturedAt:Date.now(),phase:"draft",champion:"Ahri",position:"MIDDLE",patch:"16.19.1",time:null,gold:null,allies:[],enemies:[],headline:"Provisional pick",sections:[]};
  const send=(body:unknown,auth=true)=>call("/desktop/live",{method:"POST",headers:auth?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)});
  expect((await send(frame,false)).res.status).toBe(401);
  expect((await send(frame)).body.accepted).toBe(true);
  expect((await send({...frame,sequence:0})).body.accepted).toBe(false);
  expect((await call("/live",{cookie:other})).body.frame).toBeNull();
  expect((await call("/live",{cookie})).body.frame.champion).toBe("Ahri");
  expect((await send({...frame,sequence:2,localToken:"must-not-pass"})).res.status).toBe(400);
  expect((await send({...frame,sequence:2,capturedAt:Date.now()-60000})).res.status).toBe(400);
  const devices=await call("/desktop/devices",{cookie});
  await call(`/desktop/devices/${devices.body.devices[0].id}`,{method:"DELETE",cookie});
  expect((await send({...frame,sequence:3})).res.status).toBe(401);
  expect((await call("/live",{cookie})).body.frame).toBeNull();
 });
});

it("does not double-count a completed game when ingestion retries",async()=>{
 const game={matchId:"TEST_IDEMPOTENT",platform:"na1",patch:"16.19",counted:true,rows:[{champion:"Ahri",position:"MIDDLE",kind:"games" as const,key:"",win:true,minute:null}]};
 await recordGame(database.db,game);
 const first=await database.db.select().from(schema.statsCounts);
 await recordGame(database.db,game);
 expect(await database.db.select().from(schema.statsCounts)).toEqual(first);
});
