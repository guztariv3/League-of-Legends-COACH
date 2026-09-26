import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { inTauri, OVERLAY_EVENT, type OverlayState } from "./bridge";
import "./live.css";

/**
 * The optional overlay (D-11, off by default): a small transparent window over the game with the
 * item-gold difference and the next items. It only draws what the Live Coach window sends it;
 * clicks pass through it to the game.
 */

const k = (n: number) => `${n >= 0 ? "+" : "−"}${(Math.abs(n) / 1000).toFixed(1)}k`;

function Pic({ kind, id, name, art }: { kind: "champion" | "item"; id: string | number; name: string; art: OverlayState["art"] }) {
  const [failed, setFailed] = useState(false);
  const src = art.cdn && art.version ? `${art.cdn}/cdn/${art.version}/img/${kind}/${id}.png` : null;
  if (!src || failed) return <span className="ov-pic ov-letter" role="img" aria-label={name}>{name.slice(0, 1)}</span>;
  return <img className="ov-pic" src={src} alt={name} onError={() => setFailed(true)} />;
}

function Overlay() {
  const [state, setState] = useState<OverlayState | null>(null);
  useEffect(() => {
    if (!inTauri) return;
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<OverlayState>(OVERLAY_EVENT, (e) => setState(e.payload)).then((un) => { stop = un; }));
    return () => stop?.();
  }, []);
  if (!state) return null;
  return (
    <main className="ov" aria-label="KOI Master overlay">
      <div className="ov-title">Gold difference</div>
      <ul className="ov-rows">
        {state.rows.map((r) => (
          <li key={`${r.ally.id}-${r.enemy.id}`} className="ov-row">
            <Pic kind="champion" id={r.ally.id} name={r.ally.name} art={state.art} />
            <span className={r.diff >= 0 ? "ov-diff gold-up" : "ov-diff gold-down"}>{k(r.diff)}</span>
            <Pic kind="champion" id={r.enemy.id} name={r.enemy.name} art={state.art} />
          </li>
        ))}
      </ul>
      <div className="ov-total"><span>{(state.allyTotal / 1000).toFixed(1)}k</span><span>{(state.enemyTotal / 1000).toFixed(1)}k</span></div>
      {state.next.length > 0 && (
        <div className="ov-next" aria-label="Next items">
          {state.next.map((i) => <Pic key={i.id} kind="item" id={i.id} name={i.name} art={state.art} />)}
          {state.gold !== null && <span className="ov-gold">{Math.floor(state.gold)}</span>}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Overlay /></StrictMode>);
