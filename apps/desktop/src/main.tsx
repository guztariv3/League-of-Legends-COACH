import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_CONTROLS, LiveEngine, modeInfo, type Delivery, type EngineTick, type Intensity, type LiveControls } from "@coach/live";
import { CoachAvatar } from "@coach/ui";
import { checkUpdate, inTauri, installUpdate, minimizeWindow, readLoad, readSnapshot, type UpdateInfo } from "./bridge";
import { ConnectForm, RivalsPanel, useRivals } from "./rivals";
import "./live.css";

const CONTROLS_KEY = "live.controls";
const categoryLabel: Record<string, string> = {
  own_level_spike: "Tus niveles clave (6/11/16)",
  own_item_spike: "Tus objetos completados",
  enemy_level_spike: "Nivel 6 de tu rival de línea",
  enemy_item_spike: "Objetos de tu rival de línea (sin líneas: del rival más fuerte)",
  objective_taken: "Objetivos conseguidos",
  goal_progress: "Progreso de tu enfoque",
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
  const [mode, setMode] = useState<Mode>("waiting");
  const [tick, setTick] = useState<EngineTick | null>(null);
  const [message, setMessage] = useState<(Delivery & { shownAt: number }) | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateState, setUpdateState] = useState<"idle" | "installing" | "failed">("idle");
  const rivals = useRivals(mode);
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
      const engine = new LiveEngine({
        bigItemGold: demo?.bigItemGold ?? 2200,
        spikeLevels: [6, 11, 16],
        itemPrices: demo?.itemPrices,
        itemNames: demo?.itemNames,
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

  // Updates are checked at start-up and offered only outside a game (the game always comes first).
  useEffect(() => { void checkUpdate().then(setUpdate); }, []);

  const set = (patch: Partial<LiveControls>) => setControls((c) => ({ ...c, ...patch }));
  const me = tick?.state.me;
  const game = tick ? modeInfo(tick.state) : null;
  const minutes = tick ? tick.state.time / 60 : 0;
  const reduced = controls.focus || tick?.safeMode;

  return (
    <main className={`live${reduced ? " reduced" : ""}`}>
      <div className="bar" role="toolbar" aria-label="Controles del Live Coach">
        {mode === "live" && <span className="chip chip-on">● En partida</span>}
        {mode === "waiting" && <span className="chip">Esperando partida</span>}
        {mode === "demo" && <span className="chip chip-demo">◆ Demostración</span>}
        {tick?.safeMode && <span className="chip chip-safe" title="El ordenador va justo: el Coach ahorra recursos">Modo seguro</span>}
        <span className="spacer" />
        <button className="btn" aria-pressed={controls.paused} onClick={() => set({ paused: !controls.paused })}>{controls.paused ? "Reanudar" : "Pausar"}</button>
        <button className="btn" aria-pressed={controls.muted} onClick={() => set({ muted: !controls.muted })}>{controls.muted ? "Activar" : "Silenciar"}</button>
        <button className="btn" aria-pressed={controls.focus} onClick={() => set({ focus: !controls.focus })}>Enfoque</button>
        {inTauri && <button className="btn" onClick={() => void minimizeWindow()} aria-label="Ocultar ventana">Ocultar</button>}
      </div>

      {update && mode !== "live" && (
        <div className="message compact" role="status">
          {updateState === "failed" ? (
            <div>No se pudo instalar la actualización; sigues con la versión actual.</div>
          ) : (
            <div className="bar">
              <span>Versión {update.version} disponible.</span>
              <span className="spacer" />
              <button className="btn btn-primary" disabled={updateState === "installing"} onClick={async () => {
                setUpdateState("installing");
                const r = await installUpdate();
                if (!r.ok) setUpdateState("failed");
              }}>{updateState === "installing" ? "Instalando…" : "Instalar y reiniciar"}</button>
              <button className="btn" onClick={() => setUpdate(null)}>Más tarde</button>
            </div>
          )}
        </div>
      )}

      <RivalsPanel scout={rivals.scout} collapsed={mode === "live"} />

      <section className="stage" aria-live="polite">
        {message && !controls.muted ? (
          <div className="presence">
            <CoachAvatar expression={message.signal.category.startsWith("enemy") ? "concerned" : "happy"} />
            <div className={`message${message.compact ? " compact" : ""}`}>
              <div>{message.signal.text}</div>
              <div className="when">minuto {Math.floor(message.shownAt / 60)}</div>
            </div>
          </div>
        ) : (
          <div className="presence">
            <CoachAvatar quiet expression={controls.paused ? "thinking" : "idle"} />
            <span className="quiet">
              {controls.paused ? "En pausa." : controls.muted ? "Silenciado." : mode === "waiting" ? (inTauri ? "Te avisaré solo cuando algo importe." : "Abre la app de escritorio durante una partida, o prueba la demostración.") : "Nada importante ahora mismo."}
            </span>
          </div>
        )}
      </section>

      {game && (
        <div className="mode-line" title={game.lanes ? undefined : "Sin líneas: en lugar de tu rival de línea, te aviso del rival con más objetos grandes."}>
          {game.label}{game.lanes ? "" : " · sin líneas"}
        </div>
      )}
      {me && (
        <div className="stats" aria-label="Tu partida">
          <span>{Math.floor(minutes)}:{String(Math.floor(tick!.state.time % 60)).padStart(2, "0")}</span>
          <span>Nivel {me.level}</span>
          <span>{me.kills}/{me.deaths}/{me.assists}</span>
          {minutes >= 1 && <span>{(me.cs / minutes).toFixed(1)} CS/min</span>}
        </div>
      )}

      <details>
        <summary>Ajustes</summary>
        <label>
          Intensidad
          <select value={controls.intensity} onChange={(e) => set({ intensity: e.target.value as Intensity })}>
            <option value="low">Baja</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
          </select>
        </label>
        <label><input type="checkbox" checked={focusCs} onChange={(e) => setFocusCs(e.target.checked)} /> Quiero centrarme en el CS</label>
        <fieldset style={{ border: 0, padding: 0, margin: "6px 0" }}>
          <legend>Qué puede avisarte</legend>
          {Object.entries(categoryLabel).map(([k, label]) => (
            <label key={k}>
              <input type="checkbox" checked={controls.categories[k] ?? false} onChange={(e) => set({ categories: { ...controls.categories, [k]: e.target.checked } })} />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="quiet">
          El Coach solo lee los datos que el propio juego publica y nunca te da órdenes. No rastrea definitivas ni hechizos de invocador rivales.
        </p>
        <h3>Conexión con la web</h3>
        <ConnectForm link={rivals.link} problem={rivals.problem} onConnect={rivals.connect} onDisconnect={rivals.disconnect} />
        <button className="btn" onClick={() => setMode((m) => (m === "demo" ? "waiting" : "demo"))}>{mode === "demo" ? "Salir de la demostración" : "Probar demostración"}</button>
      </details>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LiveWindow />
  </StrictMode>,
);
