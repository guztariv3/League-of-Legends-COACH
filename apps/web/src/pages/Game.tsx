import { useState } from "react";
import { ChampionIcon } from "../assets";
import { RivalCard } from "../components/RivalCard";
import { api, type DraftAnalysis, type DraftPoint, type GamePlan, type PlanLine, type ScoutResult } from "../api";
import { ErrorNotice, Loading, SyntheticBadge } from "../components/ui";
import { useLoad } from "../session";

const kindLabel = { fact: "Fact", observation: "Observation", hypothesis: "Hypothesis" } as const;

/**
 * Pre-game area (brief §41–44): a draft prepared by hand (champions only) and,
 * once the game has started, the game in progress with scouting. The desktop
 * app will feed the same analysis automatically in Phase 4.
 */
export function Game() {
  return (
    <div className="stack" style={{ gap: 24 }}>
      <header>
        <h1 className="page-title">Pre-game</h1>
        <p className="page-sub" style={{ margin: 0 }}>Prepare your game and, once you are at the loading screen, check your opponents.</p>
      </header>
      <LiveGame />
      <ManualDraft />
    </div>
  );
}

function Points({ draft }: { draft: DraftAnalysis }) {
  const point = (p: DraftPoint) => (
    <article key={p.id} className="insight">
      <span className="badge badge-kind">{kindLabel[p.kind]}</span>
      <p className="insight-title" style={{ marginTop: 6 }}>{p.title}</p>
      {p.detail && <p className="insight-detail">{p.detail}</p>}
    </article>
  );
  return (
    <div className="stack">
      <h3 className="tile-label" style={{ margin: 0 }}>This is what matters most</h3>
      {draft.keyPoints.length ? draft.keyPoints.map(point) : <p className="page-sub" style={{ margin: 0 }}>Nothing stands out with the information available.</p>}
      {draft.morePoints.length > 0 && (
        <details className="layer">
          <summary>More details ({draft.morePoints.length})</summary>
          <div className="stack" style={{ marginTop: 8 }}>{draft.morePoints.map(point)}</div>
        </details>
      )}
      {draft.unknownChampions.length > 0 && <p className="tile-note" style={{ margin: 0 }}>No data for: {draft.unknownChampions.join(", ")}.</p>}
      <details className="layer">
        <summary>Limits of this analysis</summary>
        <ul className="tile-note">{draft.limits.map((l) => <li key={l}>{l}</li>)}</ul>
      </details>
    </div>
  );
}

const PLAN_ROWS: [keyof Omit<GamePlan, "loadout">, string][] = [
  ["primaryObjective", "Primary objective"],
  ["secondaryObjective", "Secondary objective"],
  ["biggestThreat", "Biggest threat"],
  ["yourPowerSpike", "Your power spike"],
  ["enemyPowerSpike", "Enemy power spike"],
  ["avoid", "What to avoid"],
  ["lookFor", "What to look for"],
];
const basisLabel = { fact: "Game data", observation: "Your games", hypothesis: "Coach's read" } as const;

/** COACH GAME PLAN: the Coach's voice (hextech blue), each line with what it rests on. */
export function GamePlanCard({ plan }: { plan: GamePlan }) {
  const rows = PLAN_ROWS.flatMap(([key, label]) => (plan[key] ? [[label, plan[key]] as [string, PlanLine]] : []));
  const l = plan.loadout;
  return (
    <section className="coach-plan" aria-labelledby="h-plan">
      <h3 id="h-plan" className="coach-plan-title">Coach game plan</h3>
      <dl className="coach-plan-rows">
        {rows.map(([label, line]) => (
          <div key={label} className="coach-plan-row">
            <dt>{label}</dt>
            <dd>
              <strong>{line.text}</strong>
              <span className="coach-plan-why">{line.why} <span className="coach-plan-basis">· {basisLabel[line.basis]}</span></span>
            </dd>
          </div>
        ))}
      </dl>
      {l.games > 0 ? (
        <p className="tile-note" style={{ margin: 0 }}>
          Your usual setup ({l.games} games):{" "}
          {[
            l.keystone && `${l.keystone.name}`,
            l.spells && l.spells.names.join(" + "),
            l.maxOrder && `max ${l.maxOrder.join(" → ")}`,
            l.firstItem && `first item ${l.firstItem.name}`,
          ].filter(Boolean).join(" · ") || "not enough games yet"}
        </p>
      ) : (
        <p className="tile-note" style={{ margin: 0 }}>No games with this champion yet: the plan uses the game's data and general class tendencies.</p>
      )}
    </section>
  );
}

function LiveGame() {
  const [state, setState] = useState<{ loading: boolean; data?: ScoutResult; error?: unknown }>({ loading: false });
  const load = async () => {
    setState({ loading: true });
    try { setState({ loading: false, data: await api.scout() }); } catch (error) { setState({ loading: false, error }); }
  };
  const d = state.data;

  return (
    <section className="card stack" aria-labelledby="h-live">
      <div className="row">
        <h2 id="h-live" style={{ margin: 0 }}>Game in progress</h2>
        <span className="spacer" />
        {d?.simulated && <SyntheticBadge />}
        <button className="btn btn-primary" onClick={load} disabled={state.loading}>{state.loading ? "Searching…" : d ? "Refresh" : "Find my game"}</button>
      </div>
      <p className="tile-note" style={{ margin: 0 }}>
        It only works from the loading screen: no information about other players is looked up during champion select.
      </p>
      {state.loading && <Loading label="Looking up the game and your opponents' recent history…" />}
      {state.error ? <ErrorNotice error={state.error} /> : null}
      {d && !d.inGame && <div className="notice">{d.message}</div>}
      {d?.inGame && (
        <>
          <div className="stack" style={{ gap: 8 }}>
            <h3 className="section-title">Your opponents</h3>
            <div className="rivals">
              {d.enemies!.map((e, i) => <RivalCard key={i} e={e} />)}
            </div>
            <p className="tile-note" style={{ margin: 0 }}>
              Rank and mastery come from Riot; the rest from their recent games. A few games cannot judge anyone's skill: it is only context.
            </p>
          </div>
          <div className="stack">
            <h3 className="section-title">Your team</h3>
            <div className="row" style={{ gap: 6 }}>
              <ChampionIcon champion={d.myChampion!.id} size={52} className="portrait" />
              {d.allies!.map((a) => <ChampionIcon key={a.id} champion={a.id} size={34} />)}
            </div>
            <p style={{ margin: 0 }}>
              You play <strong>{d.myChampion!.name}</strong> with {d.allies!.map((a) => a.name).join(", ")}.
              {d.account && <span className="tile-note"> Account: {d.account}</span>}
            </p>
            <Points draft={d.draft!} />
          </div>
        </>
      )}
    </section>
  );
}

function ManualDraft() {
  const champs = useLoad(() => api.champions(), []);
  const [me, setMe] = useState("");
  const [opponent, setOpponent] = useState("");
  const [allies, setAllies] = useState<string[]>(["", "", "", ""]);
  const [enemies, setEnemies] = useState<string[]>(["", "", "", "", ""]);
  const [result, setResult] = useState<{ data?: DraftAnalysis; error?: unknown }>({});

  if (!champs.data) return champs.error ? <ErrorNotice error={champs.error} /> : <Loading />;
  const options = [...champs.data.champions].sort((a, b) => a.name.localeCompare(b.name));
  const select = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <div className="field" key={id}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
  const clean = (xs: string[]) => xs.filter(Boolean);

  return (
    <section className="card stack" aria-labelledby="h-draft">
      <h2 id="h-draft">Prepare a game</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!me) return;
          try {
            setResult({ data: await api.draft({ myChampion: me, allies: clean(allies), enemies: clean(enemies), laneOpponent: opponent || undefined }) });
          } catch (error) { setResult({ error }); }
        }}
      >
        <div className="row">
          {select("draft-me", "Your champion", me, setMe)}
          {select("draft-opp", "Lane opponent (optional)", opponent, setOpponent)}
        </div>
        <details className="layer" open>
          <summary>Allies and enemies</summary>
          <div className="row" style={{ marginTop: 8 }}>
            {allies.map((v, i) => select(`draft-ally-${i}`, `Ally ${i + 1}`, v, (x) => setAllies(allies.map((a, j) => (j === i ? x : a)))))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {enemies.map((v, i) => select(`draft-enemy-${i}`, `Enemy ${i + 1}`, v, (x) => setEnemies(enemies.map((a, j) => (j === i ? x : a)))))}
          </div>
        </details>
        <div><button className="btn btn-primary" disabled={!me}>Analyze</button></div>
      </form>
      {result.error ? <ErrorNotice error={result.error} /> : null}
      {result.data?.plan && <GamePlanCard plan={result.data.plan} />}
      {result.data && <Points draft={result.data} />}
    </section>
  );
}
