import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionHealth, DEFAULT_CONTROLS, laneOpponent, LiveEngine, modeInfo, stampNow, type Delivery, type EngineTick, type Intensity, type LiveControls } from "@coach/live";
import { STARTER_WINDOW_SEC, type EngineItems } from "@coach/coach";
import { goldPace } from "@coach/itemization";
import { markAcquired, useLiveRelay, type Output } from "./live-relay";
import { CoachAvatar, DraftCard } from "@coach/ui";
import { checkUpdate, fetchBuild, fetchItems, fetchPlan, inTauri, installUpdate, readChampSelect, readLoad, readSnapshot, setOverlay, windowControl, type ChampSelect, type UpdateInfo } from "./bridge";
import { Board, ChampArt, PlanTab, useArt, useCatalog, type BoardTab, type PersonalBuild, type PlanResponse } from "./board";
import { PreGameBuildView } from "./prebuild";
import { Home } from "./home";
import { ConnectForm, RivalsPanel, useRivals } from "./rivals";
import "./live.css";

const CONTROLS_KEY = "live.controls";
const OVERLAY_KEY = "live.overlay";
const categoryLabel: Record<string, string> = {
  own_level_spike: "Your key levels (6/11/16)",
  own_item_spike: "Your completed items",
  enemy_level_spike: "Your lane opponent's level 6",
  enemy_item_spike: "Your lane opponent's items (no lanes: the strongest enemy)",
  objective_taken: "Objectives taken",
  goal_progress: "Progress on your focus",
};

function loadControls(): LiveControls {
  try {
    const raw = localStorage.getItem(CONTROLS_KEY);
    return raw ? { ...DEFAULT_CONTROLS, ...JSON.parse(raw), paused: false } : DEFAULT_CONTROLS;
  } catch {
    return DEFAULT_CONTROLS;
  }
}

type Mode = "waiting" | "live" | "demo";
/** The window's sections, in the top navigation. In-game sections only exist during a game. */
type View = "home" | "draft" | BoardTab | "settings";
const GAME_VIEWS: [BoardTab, string][] = [["plan", "Plan"], ["items", "Items"], ["skills", "Skills"], ["gold", "Gold"]];

/** True once the game reports its end (the victory/defeat screen): the match is over. */
function gameEnded(raw: unknown): boolean {
  const events = (raw as { events?: { Events?: { EventName?: string }[] } } | null)?.events?.Events;
  return Array.isArray(events) && events.some((e) => e.EventName === "GameEnd");
}

function LiveWindow() {
  const [controls, setControls] = useState<LiveControls>(loadControls);
  const [focusCs, setFocusCs] = useState(false);
  // The overlay is off unless the player turns it on (D-11).
  const [overlay, setOverlayOn] = useState(() => { try { return localStorage.getItem(OVERLAY_KEY) === "on"; } catch { return false; } });
  const [mode, setMode] = useState<Mode>("waiting");
  const [view, setView] = useState<View>("home");
  const [tick, setTick] = useState<EngineTick | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [message, setMessage] = useState<(Delivery & { shownAt: number }) | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateState, setUpdateState] = useState<"idle" | "installing" | "failed">("idle");
  const [homeKey, setHomeKey] = useState(0);
  const [ended, setEnded] = useState(false);
  const [shareLive, setShareLive] = useState(() => localStorage.getItem("live.share") === "on");
  const coachOutput = useRef<Output | null>(null);
  const rivals = useRivals(mode);
  const art = useArt(rivals.scout?.assets ?? null);
  const catalog = useCatalog(art);
  const [showConnect, setShowConnect] = useState(false);
  const [build, setBuild] = useState<PersonalBuild | null | "loading">(null);
  const planOwner = rivals.link ? `${rivals.link.origin}:${rivals.link.token}` : null;
  const [planResponse, setPlanResponse] = useState<{owner:string;value:PlanResponse}|null>(null);
  const plan = planResponse?.owner === planOwner ? planResponse.value : null;
  const setPlan = (value:PlanResponse|null) => setPlanResponse(value && planOwner ? {owner:planOwner,value} : null);
  // Item names arrive with the game's own data; the engine fills this map as it reads.
  const itemNames = useRef(new Map<number, string>());
  const controlsRef = useRef(controls);
  const suppressNextNotice = useRef(false);
  controlsRef.current = controls;

  useEffect(() => {
    try { localStorage.setItem(CONTROLS_KEY, JSON.stringify(controls)); } catch { /* per-viewer convenience only */ }
  }, [controls]);

  /**
   * A match is over (end screen, or the game closed): every piece of live state is dropped, not
   * hidden, so nothing from it can leak into the next game, and the window goes back to Home.
   */
  const resetMatch = (confirmedEnd = false) => {
    setEnded(confirmedEnd);
    coachOutput.current = null;
    setTick(null);
    setReconnecting(false);
    setMessage(null);
    setBuild(null);
    setPlan(null);
    setEngine(null);
    itemNames.current = new Map();
    setMode("waiting");
    setView("home");
    setHomeKey((k) => k + 1);
  };

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    // One engine per match: created when a match is first read, discarded when it ends.
    let engine: LiveEngine | null = null;
    // After the end screen the game keeps answering until it closes; those reads are ignored.
    let finished = false;
    let endedTime: number | null = null;
    let live = false;
    const connection = new ConnectionHealth();
    let interrupted = false;

    const start = async () => {
      // The demo (synthetic generator) is loaded only when asked for, keeping the live window light.
      const speed = Number(new URLSearchParams(location.search).get("demoSpeed")) || 20;
      const demo = mode === "demo" ? (await import("./demo")).createDemo(speed) : null;
      const newEngine = () => {
        itemNames.current = new Map(demo?.itemNames ?? []);
        return new LiveEngine({
          bigItemGold: demo?.bigItemGold ?? 2200,
          spikeLevels: [6, 11, 16],
          itemPrices: demo?.itemPrices,
          itemNames: itemNames.current,
          focus: focusCs ? "csPerMin" : null,
        });
      };

      const loop = async () => {
        if (stopped) return;
        const load = await readLoad();
        let raw: unknown = null;
        // When this snapshot is read: its age travels with it to web Live (never re-stamped later).
        const readAt = stampNow();
        if (demo) raw = demo.snapshot();
        else {
          const snap = await readSnapshot();
          if (snap.ok) raw = snap.data;
        }
        if (stopped) return;
        const gameTime = (raw as {gameData?:{gameTime?:number}} | null)?.gameData?.gameTime;
        const nextGame = finished && endedTime !== null && typeof gameTime === "number" && gameTime >= 0 && gameTime < endedTime - 30;
        if (raw === null) {
          const health = connection.observe(false, Date.now());
          if (live) {
            interrupted = true;
            setReconnecting(true);
            setMessage(null);
            // A confirmed GameEnd is immediate; an inaccessible API gets a grace period.
            if (health === "ended") { live = false; engine = null; resetMatch(); }
          }
          finished = false;
        } else if (!demo && gameEnded(raw)) {
          if (!finished) { live = false; engine = null; finished = true; endedTime = typeof gameTime === "number" ? gameTime : null; resetMatch(true); }
        } else if (!finished || nextGame) {
          finished = false;
          if (!engine) { engine = newEngine(); live = true; if (!demo) { setEnded(false); setMode("live"); setView("items"); } }
          // Do not replay notifications accumulated during a connection interruption.
          const t = engine.tick(raw, { ...controlsRef.current, paused: controlsRef.current.paused || interrupted || suppressNextNotice.current }, load);
          suppressNextNotice.current = false;
          const health = connection.observe(!t.degraded, Date.now());
          setReconnecting(Boolean(t.degraded));
          if (t.degraded) {
            interrupted = true;
            setMessage(null);
            if (health === "ended") { live = false; engine = null; resetMatch(); }
          } else {
            interrupted = false;
            markAcquired(t.state, readAt);
            setTick(t);
            const d = t.deliveries[0];
            if (d && !controlsRef.current.paused) setMessage({ ...d, shownAt: t.state.time });
          }
        }
        // Waiting for a game: poll slowly. In game: the engine's pace (slower in Safe Mode).
        if (!stopped) timer = setTimeout(loop, raw === null || finished ? 5000 : demo ? 500 : engine?.safeMode.pollMs ?? 1000);
      };
      await loop();
    };
    void start();
    return () => { stopped = true; clearTimeout(timer); };
  }, [mode === "demo", focusCs]);

  useEffect(() => { if (controls.paused) { setMessage(null); suppressNextNotice.current = true; } }, [controls.paused]);

  // Messages fade out on their own; the Coach is mostly silent.
  useEffect(() => {
    if (!message || !tick) return;
    const age = tick.state.time - message.shownAt;
    if (age > (message.compact ? 12 : 25) || (mode === "demo" && age > 60)) setMessage(null);
  }, [tick, message, mode]);

  // Your build with this champion, once per game, from your own history on the site.
  const myChampion = mode === "live" ? tick?.state.me?.championId ?? null : null;
  const buildMode = tick?.state.map === 11 ? "summoners_rift" : tick?.state.map === 12 ? "aram" : null;
  useEffect(() => {
    setBuild(null);
    const link = rivals.link;
    if (!link || !myChampion || !buildMode) return;
    let stopped = false;
    setBuild("loading");
    void fetchBuild<PersonalBuild>(link.origin, link.token, myChampion, buildMode).then((r) => { if (!stopped) setBuild(r.ok ? r.data : null); });
    return () => { stopped = true; };
  }, [rivals.link, myChampion, buildMode]);

  // The overlay shows only while a real game is running, and only if the player turned it on.
  const overlayVisible = overlay && mode === "live" && !controls.paused && !reconnecting;
  useEffect(() => { void setOverlay(overlayVisible); }, [overlayVisible]);
  useEffect(() => { try { localStorage.setItem(OVERLAY_KEY, overlay ? "on" : "off"); } catch { /* per-viewer convenience only */ } }, [overlay]);

  // The Coach's game plan, once per game, for the champions of this game (Summoner's Rift only).
  const st = mode === "live" ? tick?.state : undefined;
  const planKey = st?.me && st.map === 11 && st.enemies.length ? [st.me.championId, st.me.position ?? "", laneOpponent(st)?.championId ?? "", ...st.allies.map((a) => a.championId), "|", ...st.enemies.map((e) => e.championId)].join(",") : null;
  useEffect(() => {
    setPlan(null);
    const link = rivals.link;
    if (!link || !planKey || !st?.me) return;
    let stopped = false;
    const opponent = laneOpponent(st)?.championId ?? null;
    void fetchPlan<PlanResponse>(link.origin, link.token, { me: st.me.championId, allies: st.allies.map((a) => a.championId), enemies: st.enemies.map((e) => e.championId), opponent, position: st.me.position })
      .then((r) => { if (!stopped) setPlan(r.ok ? r.data : null); });
    return () => { stopped = true; };
  }, [rivals.link, planKey]);

  // The site's build engine during the game (Summoner's Rift): asked again when your items, the
  // enemies' items or scores change. Without a connected site contextual item guidance is unavailable.
  const [engineResponse, setEngine] = useState<{context:string;build:EngineItems} | null>(null);
  const engineContext = st?.me && rivals.link ? JSON.stringify([rivals.link.origin,rivals.link.token,st.me.championId,st.me.position,laneOpponent(st)?.championId]) : null;
  const engine = engineResponse?.context === engineContext ? engineResponse.build : null;
  const opening = Boolean(st?.me && st.time < STARTER_WINDOW_SEC && st.me.itemGold < 300);
  const engineKey = st?.me && st.map === 11 && st.enemies.length
    ? [st.me.championId, st.me.position ?? "", laneOpponent(st)?.championId ?? "", Math.floor((st.gold ?? 0)/100), Math.floor(st.time/15), opening ? "open" : "", [...st.me.items].sort().join("."), "|",
       ...st.enemies.map((e) => `${e.championId}:${[...e.items].sort().join(".")}:${e.kills}:${e.deaths}`)].join(",")
    : null;
  useEffect(() => {
    const link = rivals.link;
    if (!link || !engineKey || !st?.me) { setEngine(null); return; }
    let stopped = false;
    const me = st.me;
    const enemies = st.enemies.map((e) => ({ championId: e.championId, items: e.items, kills: e.kills, deaths: e.deaths }));
    const opponent = laneOpponent(st)?.championId ?? null;
    const t = setTimeout(() => {
      void fetchItems<{ build: EngineItems | null }>(link.origin, link.token, { me: me.championId, mine: me.items, enemies, opponent, position: me.position || null, opening, economy: {gold:st.gold,time:st.time,income:goldPace(st.time,st.gold,me.itemGold),opponentCompleted: Boolean(laneOpponent(st)?.items.some(id=>catalog?.items.get(id)?.completed))} })
        .then((r) => { if (!stopped) setEngine(r.ok && r.data.build && engineContext ? {context:engineContext,build:r.data.build} : null); });
    }, 250);
    return () => { stopped = true; clearTimeout(t); };
  }, [rivals.link, engineKey, engineContext]);

  // Champion select (D-13): read-only polling of the League Client while no game is running.
  const [champSelect, setChampSelect] = useState<ChampSelect | null>(null);
  const [csResponse, setCsResponse] = useState<{key:string; plan:PlanResponse} | null>(null);
  useEffect(() => {
    if (!inTauri || mode !== "waiting") { setChampSelect(null); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const readAt = stampNow();
      const r = await readChampSelect();
      if (stopped) return;
      if (r.ok) markAcquired(r.data, readAt);
      setChampSelect(r.ok ? r.data : null);
      // Faster inside champion select, slow when the client is closed.
      timer = setTimeout(loop, !r.ok ? 10_000 : r.data.phase === "ChampSelect" ? 400 : 2000);
    };
    void loop();
    return () => { stopped = true; clearTimeout(timer); };
  }, [mode]);

  const inSelect = mode === "waiting" && champSelect?.phase === "ChampSelect";
  // Entering champion select opens the Draft section; leaving it without a game goes back Home.
  useEffect(() => {
    if (inSelect) { setEnded(false); setView("draft"); }
    else setView((v) => (v === "draft" ? "home" : v));
  }, [inSelect]);
  const csMe = inSelect ? champSelect?.me?.championId ?? 0 : 0;
  const csPosition = champSelect?.me?.position ?? "";
  const csKey = csMe ? [csMe, csPosition, champSelect?.me?.locked ? "locked" : "hover", "|", ...(champSelect?.allies ?? []), "|", ...(champSelect?.enemies ?? []),JSON.stringify([champSelect?.bans,champSelect?.timerPhase,champSelect?.alliedPositions])].join(",") : null;
  const csOwnerKey = csKey && planOwner ? `${planOwner}:${csKey}` : null;
  const csPlan = csResponse?.key === csOwnerKey ? csResponse.plan : null;
  const draftCache = useRef(new Map<string,{at:number;plan:PlanResponse}>());
  useEffect(() => {
    setCsResponse(null);
    const link = rivals.link;
    if (!link || !csKey || !champSelect) { if (!csKey) setCsResponse(null); return; }
    let stopped = false;
    const cacheKey = `${link.origin}:${link.token}:${csKey}`;
    const cached = draftCache.current.get(cacheKey);
    if (cached && Date.now()-cached.at<30000) { setCsResponse({key:cacheKey,plan:cached.plan}); return; }
    // Hovers change quickly: wait briefly before asking for a plan.
    const t = setTimeout(() => {
      void fetchPlan<PlanResponse>(link.origin, link.token, {
        me: String(csMe), allies: (champSelect.allies ?? []).map(String), enemies: (champSelect.enemies ?? []).map(String), opponent: null,
        position: csPosition || null, preview: !champSelect.me?.locked, draftContext:{bans:champSelect.bans,timerPhase:champSelect.timerPhase,alliedPositions:champSelect.alliedPositions},
      }).then((r) => { if (!stopped) { setCsResponse(r.ok ? {key:cacheKey,plan:r.data} : null); if(r.ok){if(draftCache.current.size>30)draftCache.current.clear();draftCache.current.set(cacheKey,{at:Date.now(),plan:r.data});} } });
    }, 150);
    return () => { stopped = true; clearTimeout(t); };
  }, [rivals.link, csKey]);

  const liveShareStatus = useLiveRelay({rivals:rivals.scout?.enemies,contextual:Boolean(engine),enabled:shareLive,link:rivals.link,state:mode==="live" ? tick?.state??null:null,select:champSelect,draft:csPlan,plan,patch:art.version,paused:controls.paused,reconnecting,ended,output:coachOutput,demo:mode==="demo"});

  // Updates are checked at start-up and offered only outside a game (the game always comes first).
  useEffect(() => { void checkUpdate().then(setUpdate); }, []);

  const set = (patch: Partial<LiveControls>) => setControls((c) => ({ ...c, ...patch }));
  const me = tick?.state.me;
  const inGame = Boolean(me) && (mode === "live" || mode === "demo");
  const game = tick ? modeInfo(tick.state) : null;
  const minutes = tick ? tick.state.time / 60 : 0;
  const reduced = controls.focus || tick?.safeMode;

  const nav: [View, string][] = [
    ["home", "Home"],
    ...(inSelect ? [["draft", "Draft"] as [View, string]] : []),
    ...(inGame ? GAME_VIEWS : []),
    ["settings", "Settings"],
  ];
  // A view that no longer exists (the game ended, champion select closed) falls back to Home.
  const shown: View = nav.some(([k]) => k === view) ? view : "home";
  const boardView = GAME_VIEWS.find(([k]) => k === shown)?.[0] ?? null;

  return (
    <main className={`live${reduced ? " reduced" : ""}`}>
      <header className="titlebar" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>
          <span className="brand-mark" aria-hidden="true"><CoachAvatar quiet /></span>
          KOI Master
        </span>
        {mode === "live" && <span className="chip chip-on">● In game</span>}
        {inSelect && <span className="chip chip-on">● Champion select</span>}
        {mode === "waiting" && !inSelect && <span className="chip">Waiting for a game</span>}
        {mode === "demo" && <span className="chip chip-demo">◆ Demo</span>}
        {tick?.safeMode && <span className="chip chip-safe" title="Your computer is under load: the Coach saves resources">Safe mode</span>}
        {controls.paused && <span className="chip">Paused</span>}
        <span className="spacer" data-tauri-drag-region />
        {inTauri && (
          <span className="window-controls">
            <button className="wc" onClick={() => void windowControl("minimize")} aria-label="Minimize">–</button>
            <button className="wc" onClick={() => void windowControl("maximize")} aria-label="Maximize or restore">▢</button>
            <button className="wc wc-close" onClick={() => void windowControl("close")} aria-label="Close">✕</button>
          </span>
        )}
      </header>

      <nav className="main-nav" role="tablist" aria-label="Sections">
        {nav.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={shown === key} className={`nav-tab${key === "settings" ? " nav-tab-icon" : ""}`} onClick={() => setView(key)}
            aria-label={key === "settings" ? label : undefined} title={key === "settings" ? label : undefined}>
            {key === "settings" ? <span aria-hidden="true">⚙</span> : label}
          </button>
        ))}
      </nav>

      {update && mode !== "live" && (
        <div className="message compact" role="status">
          {updateState === "failed" ? (
            <div>The update could not be installed; you are still on the current version.</div>
          ) : (
            <div className="bar">
              <span>Version {update.version} available.</span>
              <span className="spacer" />
              <button className="btn btn-primary" disabled={updateState === "installing"} onClick={async () => {
                setUpdateState("installing");
                const r = await installUpdate();
                if (!r.ok) setUpdateState("failed");
              }}>{updateState === "installing" ? "Installing…" : "Install and restart"}</button>
              <button className="btn" onClick={() => setUpdate(null)}>Later</button>
            </div>
          )}
        </div>
      )}

      {shown !== "settings" && <RivalsPanel scout={rivals.scout} collapsed={mode === "live"} />}

      {shown === "home" && (
        <>
          <Home link={rivals.link} art={art} refreshKey={homeKey} />
          {!rivals.link && (
            <section className="connect-card" aria-labelledby="connect-h">
              <h2 id="connect-h">Connect to the website (optional)</h2>
              {showConnect ? (
                <ConnectForm link={rivals.link} problem={rivals.problem} onConnect={(l) => { rivals.connect(l); setShowConnect(false); }} onDisconnect={rivals.disconnect} />
              ) : (
                <>
                  <p className="quiet">Optional, if you have a KOI Master website account: adds your profile here, your opponents at the loading screen and your history. The game board works without connecting; contextual item suggestions require the connected server.</p>
                  {rivals.problem && <p className="quiet" role="alert">{rivals.problem}</p>}
                  <button className="btn btn-primary" onClick={() => setShowConnect(true)}>Connect</button>
                </>
              )}
            </section>
          )}
        </>
      )}

      {shown === "draft" && (
        <section className="connect-card" aria-labelledby="cs-h">
          <h2 id="cs-h">Champion select</h2>
          {csMe === 0 ? (
            <p className="quiet">Pick or hover a champion to see your game plan.</p>
          ) : (
            <>
              {csPlan?.champion && (
                <div className="bar">
                  <ChampArt id={csPlan.champion} name={csPlan.champion} size={32} art={art} />
                  <strong>{csPlan.champion}</strong>
                  <span className="quiet small">{champSelect?.me?.locked ? "locked in" : "hovering"}{champSelect?.me?.position ? ` · ${champSelect.me.position}` : ""}</span>
                </div>
              )}
              {csPlan?.draftState && <details><summary>Draft state and roles</summary><p>{csPlan.draftState.phase}</p><p>Allied bans: {csPlan.draftState.allyBans.join(", ")||"None reported"}</p><p>Enemy bans: {csPlan.draftState.enemyBans.join(", ")||"None reported"}</p><p>{csPlan.draftState.roles.join(" · ")}</p><p>Enemy roles remain uncertain until reported.</p></details>}
              {!csPlan && <p role="status">{rivals.link ? "Reading your provisional pick…" : "Connect the desktop to your account to load Draft Coach."}</p>}
              {!champSelect?.me?.locked && csPlan?.draftRead && <DraftCard read={csPlan.draftRead} />}
              {!champSelect?.me?.locked && csPlan && !csPlan.draftRead && <p>Detailed draft knowledge is unavailable.</p>}
              {csPlan && <>{!champSelect?.me?.locked && <p className="quiet">Provisional recommendations — update as picks change.</p>}{csPlan?.build && <PreGameBuildView build={csPlan.build} art={art} />}{champSelect?.me?.locked && <PlanTab plan={csPlan} connected={Boolean(rivals.link)} />}</>}
            </>
          )}
          <p className="quiet small">Read from your League client, read-only: nothing is changed there, and only champions are used, never other players' names.</p>
        </section>
      )}

      {/* The board stays mounted for the whole match (it feeds the overlay and remembers the Coach's
          last recommendation); other sections only hide it. */}
      {inGame && tick?.state.me && (
        <div hidden={!boardView}>
          <Board onOutput={(coach,now,time)=>{coachOutput.current={coach,now,time};}} state={tick.state} art={art} catalog={catalog} demo={mode === "demo"} build={mode === "demo" ? null : build} connected={Boolean(rivals.link) && mode !== "demo"} overlay={overlayVisible} plan={mode === "demo" ? null : plan} engine={mode === "demo" ? null : engine} suspended={reconnecting ? "reconnecting" : controls.paused ? "paused" : null} tab={boardView ?? "items"} />
        </div>
      )}

      {shown === "settings" && (
        <section className="settings" aria-label="Settings">
          <h2 className="label">Coach</h2>
          <div className="bar">
            <button className="btn" aria-pressed={controls.paused} onClick={() => set({ paused: !controls.paused })}>{controls.paused ? "Resume" : "Pause"}</button>
            <button className="btn" aria-pressed={controls.muted} onClick={() => set({ muted: !controls.muted })}>{controls.muted ? "Unmute" : "Mute"}</button>
            <button className="btn" aria-pressed={controls.focus} onClick={() => set({ focus: !controls.focus })}>Focus mode</button>
          </div>
          <label>
            Intensity
            <select value={controls.intensity} onChange={(e) => set({ intensity: e.target.value as Intensity })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
          <label><input type="checkbox" checked={focusCs} onChange={(e) => setFocusCs(e.target.checked)} /> I want to focus on CS</label>
          <label>
            <input type="checkbox" checked={overlay} onChange={(e) => setOverlayOn(e.target.checked)} /> Show the overlay over the game (gold difference and next items)
          </label>
          <p className="quiet small">Off by default. It is a separate transparent window that lets your clicks through; it doesn't touch the game. It needs the game in borderless or windowed mode.</p>
          <fieldset style={{ border: 0, padding: 0, margin: "6px 0" }}>
            <legend>What it can tell you about</legend>
            {Object.entries(categoryLabel).map(([k, label]) => (
              <label key={k}>
                <input type="checkbox" checked={controls.categories[k] ?? false} onChange={(e) => set({ categories: { ...controls.categories, [k]: e.target.checked } })} />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="quiet">
            The Coach only reads the data the game itself publishes and never gives you orders. It does not track enemy ultimates or summoner spells.
          </p>
          <h2 className="label">Website connection</h2>
          <label><input type="checkbox" checked={shareLive} onChange={e=>{setShareLive(e.target.checked);localStorage.setItem("live.share",e.target.checked ? "on":"off");}} /> Share this game with my private web Live page</label>
          <p className="quiet small" role="status">Connection: {liveShareStatus.text}</p>
          <p className="quiet small">Shares champion picks, visible match information and Coach recommendations with your linked account. Keep this app open. League credentials stay on this computer.</p>
          {rivals.link
            ? <ConnectForm link={rivals.link} problem={rivals.problem} onConnect={rivals.connect} onDisconnect={rivals.disconnect} />
            : <p className="quiet">Not connected. Use the <strong>Connect</strong> button on Home.</p>}
          <button className="btn" onClick={() => {
            if (mode === "demo") resetMatch();
            else { setMode("demo"); setView("items"); }
          }}>{mode === "demo" ? "Exit demo" : "Try the demo"}</button>
        </section>
      )}

      {shown !== "settings" && (
        <section className={`stage${inGame ? " stage-compact" : ""}`} aria-live="polite">
          {message && !controls.muted && !controls.paused && !reconnecting ? (
            <div className="presence">
              <CoachAvatar expression={message.signal.category.startsWith("enemy") ? "concerned" : "happy"} />
              <div className={`message${message.compact ? " compact" : ""}`}>
                <div>{message.signal.text}</div>
                <div className="when">minute {Math.floor(message.shownAt / 60)}</div>
              </div>
            </div>
          ) : (
            <div className="presence">
              <CoachAvatar quiet expression={controls.paused ? "thinking" : "idle"} />
              <span className="quiet">
                {controls.paused ? "Paused." : controls.muted ? "Muted." : mode === "waiting" ? (inTauri ? "I will only speak up when something matters." : "Open the desktop app during a game, or try the demo.") : "Nothing important right now."}
              </span>
            </div>
          )}
        </section>
      )}

      {inGame && game && (
        <div className="mode-line" title={game.lanes ? undefined : "No lanes: instead of your lane opponent, I tell you about the enemy with the most major items."}>
          {game.label}{game.lanes ? "" : " · no lanes"}
        </div>
      )}
      {inGame && me && (
        <div className="stats" aria-label="Your game">
          <span>{Math.floor(minutes)}:{String(Math.floor(tick!.state.time % 60)).padStart(2, "0")}</span>
          <span>Level {me.level}</span>
          <span>{me.kills}/{me.deaths}/{me.assists}</span>
          {minutes >= 1 && <span>{(me.cs / minutes).toFixed(1)} CS/min</span>}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LiveWindow />
  </StrictMode>,
);
