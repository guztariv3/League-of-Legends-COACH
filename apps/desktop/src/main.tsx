import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_CONTROLS, laneOpponent, LiveEngine, modeInfo, type Delivery, type EngineTick, type Intensity, type LiveControls } from "@coach/live";
import { CoachAvatar } from "@coach/ui";
import { checkUpdate, fetchBuild, fetchPlan, inTauri, installUpdate, minimizeWindow, readLoad, readSnapshot, setOverlay, type UpdateInfo } from "./bridge";
import { Board, useArt, useCatalog, type PersonalBuild, type PlanResponse } from "./board";
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

function LiveWindow() {
  const [controls, setControls] = useState<LiveControls>(loadControls);
  const [focusCs, setFocusCs] = useState(false);
  // The overlay is off unless the player turns it on (D-11).
  const [overlay, setOverlayOn] = useState(() => { try { return localStorage.getItem(OVERLAY_KEY) === "on"; } catch { return false; } });
  const [mode, setMode] = useState<Mode>("waiting");
  const [tick, setTick] = useState<EngineTick | null>(null);
  const [message, setMessage] = useState<(Delivery & { shownAt: number }) | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateState, setUpdateState] = useState<"idle" | "installing" | "failed">("idle");
  const rivals = useRivals(mode);
  const art = useArt(rivals.scout?.assets ?? null);
  const catalog = useCatalog(art);
  const [showConnect, setShowConnect] = useState(false);
  const [build, setBuild] = useState<PersonalBuild | null | "loading">(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  // Item names arrive with the game's own data; the engine fills this map as it reads.
  const itemNames = useRef(new Map<number, string>());
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  useEffect(() => {
    try { localStorage.setItem(CONTROLS_KEY, JSON.stringify(controls)); } catch { /* per-viewer convenience only */ }
  }, [controls]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const start = async () => {
      // The demo (synthetic generator) is loaded only when asked for, keeping the live window light.
      const speed = Number(new URLSearchParams(location.search).get("demoSpeed")) || 20;
      const demo = mode === "demo" ? (await import("./demo")).createDemo(speed) : null;
      itemNames.current = new Map(demo?.itemNames ?? []);
      const engine = new LiveEngine({
        bigItemGold: demo?.bigItemGold ?? 2200,
        spikeLevels: [6, 11, 16],
        itemPrices: demo?.itemPrices,
        itemNames: itemNames.current,
        focus: focusCs ? "csPerMin" : null,
      });

      const loop = async () => {
        if (stopped) return;
        const load = await readLoad();
        let raw: unknown = null;
        if (demo) raw = demo.snapshot();
        else {
          const snap = await readSnapshot();
          if (snap.ok) raw = snap.data;
          else if (!stopped) setMode((m) => (m === "live" ? "waiting" : m));
        }
        if (raw !== null && !stopped) {
          if (!demo) setMode("live");
          const t = engine.tick(raw, controlsRef.current, load);
          setTick(t);
          const d = t.deliveries[0];
          if (d) setMessage({ ...d, shownAt: t.state.time });
        }
        // Waiting for a game: poll slowly. In game: the engine's pace (slower in Safe Mode).
        if (!stopped) timer = setTimeout(loop, raw === null ? 5000 : demo ? 500 : engine.safeMode.pollMs);
      };
      await loop();
    };
    void start();
    return () => { stopped = true; clearTimeout(timer); };
  }, [mode === "demo", focusCs]);

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
  const overlayVisible = overlay && mode === "live" && !controls.paused;
  useEffect(() => { void setOverlay(overlayVisible); }, [overlayVisible]);
  useEffect(() => { try { localStorage.setItem(OVERLAY_KEY, overlay ? "on" : "off"); } catch { /* per-viewer convenience only */ } }, [overlay]);

  // The Coach's game plan, once per game, for the champions of this game (Summoner's Rift only).
  const st = mode === "live" ? tick?.state : undefined;
  const planKey = st?.me && st.map === 11 && st.enemies.length ? [st.me.championId, ...st.allies.map((a) => a.championId), "|", ...st.enemies.map((e) => e.championId)].join(",") : null;
  useEffect(() => {
    setPlan(null);
    const link = rivals.link;
    if (!link || !planKey || !st?.me) return;
    let stopped = false;
    const opponent = laneOpponent(st)?.championId ?? null;
    void fetchPlan<PlanResponse>(link.origin, link.token, { me: st.me.championId, allies: st.allies.map((a) => a.championId), enemies: st.enemies.map((e) => e.championId), opponent })
      .then((r) => { if (!stopped) setPlan(r.ok ? r.data : null); });
    return () => { stopped = true; };
  }, [rivals.link, planKey]);

  // Updates are checked at start-up and offered only outside a game (the game always comes first).
  useEffect(() => { void checkUpdate().then(setUpdate); }, []);

  const set = (patch: Partial<LiveControls>) => setControls((c) => ({ ...c, ...patch }));
  const me = tick?.state.me;
  const game = tick ? modeInfo(tick.state) : null;
  const minutes = tick ? tick.state.time / 60 : 0;
  const reduced = controls.focus || tick?.safeMode;

  return (
    <main className={`live${reduced ? " reduced" : ""}`}>
      <div className="bar" role="toolbar" aria-label="Live Coach controls">
        {mode === "live" && <span className="chip chip-on">● In game</span>}
        {mode === "waiting" && <span className="chip">Waiting for a game</span>}
        {mode === "demo" && <span className="chip chip-demo">◆ Demo</span>}
        {tick?.safeMode && <span className="chip chip-safe" title="Your computer is under load: the Coach saves resources">Safe mode</span>}
        <span className="spacer" />
        <button className="btn" aria-pressed={controls.paused} onClick={() => set({ paused: !controls.paused })}>{controls.paused ? "Resume" : "Pause"}</button>
        <button className="btn" aria-pressed={controls.muted} onClick={() => set({ muted: !controls.muted })}>{controls.muted ? "Unmute" : "Mute"}</button>
        <button className="btn" aria-pressed={controls.focus} onClick={() => set({ focus: !controls.focus })}>Focus</button>
        {inTauri && <button className="btn" onClick={() => void minimizeWindow()} aria-label="Hide window">Hide</button>}
      </div>

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

      <RivalsPanel scout={rivals.scout} collapsed={mode === "live"} />

      {tick?.state.me && (
        <Board state={tick.state} names={itemNames.current} art={art} catalog={catalog} demo={mode === "demo"} build={mode === "demo" ? null : build} connected={Boolean(rivals.link) && mode !== "demo"} overlay={overlayVisible} plan={mode === "demo" ? null : plan} />
      )}

      {!rivals.link && mode === "waiting" && (
        <section className="connect-card" aria-labelledby="connect-h">
          <h2 id="connect-h">Connect to the website (optional)</h2>
          {showConnect ? (
            <ConnectForm link={rivals.link} problem={rivals.problem} onConnect={(l) => { rivals.connect(l); setShowConnect(false); }} onDisconnect={rivals.disconnect} />
          ) : (
            <>
              <p className="quiet">Optional, if you have a KOI Master website account: adds your opponents at the loading screen and your history. Item suggestions and the game board work without connecting.</p>
              {rivals.problem && <p className="quiet" role="alert">{rivals.problem}</p>}
              <button className="btn btn-primary" onClick={() => setShowConnect(true)}>Connect</button>
            </>
          )}
        </section>
      )}

      <section className={`stage${tick?.state.me ? " stage-compact" : ""}`} aria-live="polite">
        {message && !controls.muted ? (
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

      {game && (
        <div className="mode-line" title={game.lanes ? undefined : "No lanes: instead of your lane opponent, I tell you about the enemy with the most major items."}>
          {game.label}{game.lanes ? "" : " · no lanes"}
        </div>
      )}
      {me && (
        <div className="stats" aria-label="Your game">
          <span>{Math.floor(minutes)}:{String(Math.floor(tick!.state.time % 60)).padStart(2, "0")}</span>
          <span>Level {me.level}</span>
          <span>{me.kills}/{me.deaths}/{me.assists}</span>
          {minutes >= 1 && <span>{(me.cs / minutes).toFixed(1)} CS/min</span>}
        </div>
      )}

      <details>
        <summary>Settings</summary>
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
        <h3>Website connection</h3>
        {rivals.link
          ? <ConnectForm link={rivals.link} problem={rivals.problem} onConnect={rivals.connect} onDisconnect={rivals.disconnect} />
          : <p className="quiet">Not connected. Use the <strong>Connect</strong> button on the main screen (outside a game).</p>}
        <button className="btn" onClick={() => setMode((m) => (m === "demo" ? "waiting" : "demo"))}>{mode === "demo" ? "Exit demo" : "Try the demo"}</button>
      </details>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LiveWindow />
  </StrictMode>,
);
