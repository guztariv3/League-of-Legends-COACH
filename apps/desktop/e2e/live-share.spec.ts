import { expect, test, type Page } from "@playwright/test";
import { championJson, itemJson } from "../../../packages/itemization/src/test-fixture";

/**
 * Private web Live sharing. It is off until the player turns it on, and while it is off the
 * companion publishes nothing. Frames are stamped in the website's time (measured with
 * desktop_time), so a PC clock that runs ahead or behind can still share; if the time can't be
 * checked or the site rejects a frame, the Settings line says so and nothing stale is sent.
 *
 * Two independent simulated clocks: the website's (`SERVER + performance.now()`, the true time)
 * and the PC's wall clock (`Date`, installed with an offset and changed with setSystemTime, which
 * does not move the website's). The stubbed website applies the real server rule: a frame is
 * accepted only if captured at most 15 s ago and at most 5 s ahead, by the website's clock.
 */
const SERVER = Date.UTC(2026, 8, 28, 12);
interface Mock { pcAheadMs?: number; timeFails?: boolean; alwaysReject?: boolean; select?: boolean; game?: boolean }
interface Sent { phase: string; capturedAt: number; serverNow: number; accepted: boolean }

async function linkedAndWaiting(page: Page, mock: Mock = {}, { share = false } = {}) {
  await page.clock.install({ time: SERVER + (mock.pcAheadMs ?? 0) });
  await page.addInitScript(({ mock, share, SERVER, itemJson, championJson }) => {
    localStorage.setItem("koi.link", JSON.stringify({ origin: "https://koi.example", token: "device-token-for-tests-only" }));
    if (share) localStorage.setItem("live.share", "on");
    const w = window as unknown as Record<string, unknown>;
    const sent: Sent[] = [];
    w.__sent = sent;
    w.__timeCalls = 0;
    w.__timeFails = Boolean(mock.timeFails);
    // Website time at which the game / champion select data was actually read (true time).
    w.__readAt = null;
    const serverNow = () => SERVER + performance.now();
    const hang = () => new Promise(() => {}); // the reader stops answering: the last read is kept
    // The reader answers for the first 2 s, then stops: the app keeps its last read.
    const answersUntil = serverNow() + 2000;
    const snapshot = {
      activePlayer: { riotId: "Yo#EUW", level: 9, currentGold: 1000, abilities: { Q: { abilityLevel: 4 }, W: { abilityLevel: 1 }, E: { abilityLevel: 1 }, R: { abilityLevel: 1 } } },
      allPlayers: ["Ahri", "Lux", "Jinx", "Garen", "Malphite", "Zed", "Draven", "Miss Fortune", "Aatrox", "Wukong"].map((name, i) => ({
        championName: name, rawChampionName: `game_character_displayname_${name}`, riotId: i === 0 ? "Yo#EUW" : `P${i}#EUW`,
        team: i < 5 ? "ORDER" : "CHAOS", level: 9, position: "", items: [], scores: { kills: 1, deaths: 1, assists: 2, creepScore: 80 },
      })),
      events: { Events: [] },
      gameData: { gameMode: "CLASSIC", gameTime: 900, mapNumber: 11 },
    };
    void itemJson; void championJson;
    w.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: { frame?: { phase: string; capturedAt: number } }) => {
        switch (cmd) {
          case "live_snapshot":
            if (!mock.game) throw "not_in_game";
            if (serverNow() > answersUntil) return hang();
            w.__readAt = serverNow();
            return snapshot;
          case "lcu_champ_select":
            if (!mock.select) throw "not_running";
            if (serverNow() > answersUntil) return hang();
            w.__readAt = serverNow();
            return { phase: "ChampSelect", me: { championId: 103, locked: false, position: "middle" }, allies: [64], enemies: [238] };
          case "system_load": return { cpu: 10, memAvailable: 0.6 };
          case "check_update": return null;
          case "desktop_scout": return { inGame: false, assets: { cdn: null, version: null } };
          case "desktop_time":
            w.__timeCalls = (w.__timeCalls as number) + 1;
            if (w.__timeFails) throw "offline";
            return { serverTime: serverNow() };
          case "desktop_live": {
            const now = serverNow(), f = args.frame!;
            const accepted = !mock.alwaysReject && f.capturedAt <= now + 5000 && now - f.capturedAt <= 15_000;
            sent.push({ phase: f.phase, capturedAt: f.capturedAt, serverNow: now, accepted });
            if (!accepted) throw "rejected";
            return { ok: true, accepted: true, serverTime: now };
          }
          default: throw "server_error";
        }
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: "live" }, currentWebview: { label: "live" } },
    };
  }, { mock, share, SERVER, itemJson: mock.game ? itemJson : null, championJson: mock.game ? championJson : null });
  if (mock.game) {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await page.route("https://ddragon.leagueoflegends.com/**", (r) => {
      const url = r.request().url();
      if (url.endsWith("/api/versions.json")) return r.fulfill({ json: ["15.19.1"] });
      if (url.endsWith("/data/en_US/item.json")) return r.fulfill({ json: itemJson });
      if (url.endsWith("/data/en_US/champion.json")) return r.fulfill({ json: championJson });
      return r.fulfill({ body: png, contentType: "image/png" });
    });
  }
}
const sent = (page: Page) => page.evaluate(() => (window as unknown as { __sent: Sent[] }).__sent);
const timeCalls = (page: Page) => page.evaluate(() => (window as unknown as { __timeCalls: number }).__timeCalls);
const readAt = (page: Page) => page.evaluate(() => (window as unknown as { __readAt: number | null }).__readAt);
const settings = (page: Page) => page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Settings" }).click();
async function openShare(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Waiting for a game")).toBeVisible();
  await settings(page);
  return page.getByLabel("Share this game with my private web Live page");
}
/** Frames carrying advice, and how old their data truly was when the website received them. */
async function advice(page: Page) {
  const at = await readAt(page);
  return (await sent(page)).filter((f) => ["live", "draft", "pregame"].includes(f.phase)).map((f) => ({ ...f, trueAge: f.serverNow - at! }));
}

test("web Live sharing: nothing is published while it is off; turning it off clears once", async ({ page }) => {
  await linkedAndWaiting(page);
  const share = await openShare(page);
  await page.clock.runFor(1500);
  expect(await sent(page)).toEqual([]);
  expect(await timeCalls(page)).toBe(0); // not even a time check while sharing is off

  await expect(share).not.toBeChecked();
  await share.check();
  await expect.poll(async () => (await sent(page)).map((f) => f.phase)).toContain("idle");
  await expect(page.getByText(/Connection: connected/)).toBeVisible();

  await share.uncheck();
  await expect(page.getByText(/Connection: off/)).toBeVisible();
  await expect.poll(async () => (await sent(page)).at(-1)?.phase).toBe("idle");
  const afterOff = (await sent(page)).length;
  await page.clock.runFor(25_000);
  // Exactly one frame after turning it off (the clearing idle frame), then silence.
  expect((await sent(page)).length).toBe(afterOff);
});

for (const [label, pcAheadMs] of [["ahead", 10 * 60_000], ["behind", -10 * 60_000]] as const) {
  test(`web Live sharing works with a PC clock 10 minutes ${label}: frames use the website's time`, async ({ page }) => {
    await linkedAndWaiting(page, { pcAheadMs, select: true }, { share: true });
    await page.goto("/");
    await page.clock.runFor(11_000); // the first frame may be an idle one (sent every 10 s)
    expect((await advice(page)).filter((f) => f.accepted).length).toBeGreaterThan(0);
    for (const f of await advice(page)) expect(Math.abs(f.serverNow - f.capturedAt - f.trueAge)).toBeLessThan(1500);
    for (const f of (await sent(page)).filter((f) => f.phase === "idle")) expect(Math.abs(f.capturedAt - f.serverNow)).toBeLessThan(1500);
    await settings(page);
    await expect(page.getByText(`your PC clock is 10 min ${label === "ahead" ? "ahead of" : "behind"} the site; sharing uses the website's time`)).toBeVisible();
  });
}

test("web Live sharing: when the time can't be checked nothing is shared and the app says so", async ({ page }) => {
  await linkedAndWaiting(page, { timeFails: true });
  const share = await openShare(page);
  await share.check();
  await expect(page.getByText(/can't check the time with the website, so nothing is shared yet/)).toBeVisible();
  await page.clock.runFor(12_000);
  expect(await sent(page)).toEqual([]);
});

test("web Live sharing: a rejected frame makes the app re-check the time and explain it", async ({ page }) => {
  await linkedAndWaiting(page, { alwaysReject: true });
  const share = await openShare(page);
  await share.check();
  await expect(page.getByText(/waiting for fresh game data \(the website only accepts recent data\)/)).toBeVisible();
  const before = await timeCalls(page);
  await page.clock.runFor(11_000); // idle frames go every 10 s; the time is re-measured first
  expect(await timeCalls(page)).toBeGreaterThan(before);
});

test("champion select read, then held 65 s before its first publication (no website time): it is not accepted as recent", async ({ page }) => {
  await linkedAndWaiting(page, { select: true, timeFails: true }, { share: true });
  await page.goto("/");
  await expect.poll(() => readAt(page)).not.toBeNull(); // read; the client then stops answering
  await settings(page);
  await expect(page.getByText(/can't check the time with the website/)).toBeVisible();
  await page.clock.runFor(65_000);
  expect(await sent(page)).toEqual([]);

  await page.evaluate(() => { (window as unknown as { __timeFails: boolean }).__timeFails = false; });
  await page.clock.runFor(8000);
  const frames = await advice(page);
  expect(frames.length).toBeGreaterThan(0);
  for (const f of frames) {
    expect(f.accepted).toBe(false);
    expect(f.serverNow - f.capturedAt).toBeGreaterThanOrEqual(65_000); // stamped with its real age
  }
  await expect(page.getByText(/waiting for fresh game data/)).toBeVisible();
});

test("champion select: the PC clock set back between reading and sending does not make old data recent", async ({ page }) => {
  await linkedAndWaiting(page, { select: true }, { share: true });
  await page.goto("/");
  await page.clock.runFor(11_000);
  expect((await advice(page)).filter((f) => f.accepted).length).toBeGreaterThan(0); // fresh: shared
  await page.clock.runFor(20_000); // the client stops answering: the kept read ages past 15 s
  const pcNow = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(pcNow - 25_000); // the player sets the PC clock back 25 s
  const changedAt = (await sent(page)).length;
  await page.clock.runFor(20_000);
  const after = (await advice(page)).slice(changedAt);
  expect(after.length).toBeGreaterThan(0);
  for (const f of await advice(page)) {
    // Never accepted once truly older than 15 s, and never stamped younger than it really is.
    if (f.accepted) expect(f.trueAge).toBeLessThanOrEqual(15_000);
    expect(f.serverNow - f.capturedAt).toBeGreaterThanOrEqual(f.trueAge - 1000);
  }
  expect(await timeCalls(page)).toBeGreaterThan(1); // the jump was noticed and the time re-measured
});

test("in game: a snapshot kept 65 s before sharing is turned on is not accepted as recent, even with the PC clock changed", async ({ page }) => {
  await linkedAndWaiting(page, { game: true, pcAheadMs: 3 * 60_000 });
  await page.goto("/");
  await expect(page.getByText("● In game")).toBeVisible();
  await expect.poll(() => readAt(page)).not.toBeNull();
  await page.clock.runFor(65_000); // the game reader stalls; the last snapshot stays on screen
  const pcNow = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(pcNow - 60_000);
  await settings(page);
  await page.getByLabel("Share this game with my private web Live page").check();
  await page.clock.runFor(8000);
  const frames = await advice(page);
  expect(frames.length).toBeGreaterThan(0);
  for (const f of frames) {
    expect(f.phase).toBe("live");
    expect(f.accepted).toBe(false);
    expect(f.serverNow - f.capturedAt).toBeGreaterThanOrEqual(f.trueAge - 1000);
  }
});
