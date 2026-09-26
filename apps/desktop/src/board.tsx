import { useEffect, useRef, useState } from "react";
import { isAdjustment, liveCoach, pickNow, SLOT_KEY, usualMaxOrder, type CoachDecision, type LiveCoach, type Slot } from "@coach/coach";
import { parseCatalog, type Catalog, type Suggestion } from "@coach/itemization";
import type { GameState, PlayerState } from "@coach/live";
import { CoachCard } from "@coach/ui";
import { sendOverlay } from "./bridge";

/** Where game art comes from: Data Dragon (Riot's public CDN), or nothing (letters). */
export interface Art { cdn: string | null; version: string | null }

const DDRAGON = "https://ddragon.leagueoflegends.com";
const VERSION_KEY = "koi.ddragon";

/**
 * Data Dragon version for images. Uses the one the web reports when connected; otherwise
 * asks Data Dragon once a day. Without network the board shows letters instead of art.
 */
export function useArt(fromSite: Art | null): Art {
  const [version, setVersion] = useState<string | null>(() => {
    try { return (JSON.parse(localStorage.getItem(VERSION_KEY) ?? "null") as { v: string } | null)?.v ?? null; } catch { return null; }
  });
  useEffect(() => {
    if (fromSite?.version) return;
    let cached: { v: string; at: number } | null = null;
    try { cached = JSON.parse(localStorage.getItem(VERSION_KEY) ?? "null"); } catch { /* ignore */ }
    if (cached && Date.now() - cached.at < 24 * 3600_000) return;
    fetch(`${DDRAGON}/api/versions.json`)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : Promise.reject()))
      .then((list) => {
        const v = list[0];
        if (!v) return;
        setVersion(v);
        try { localStorage.setItem(VERSION_KEY, JSON.stringify({ v, at: Date.now() })); } catch { /* ignore */ }
      })
      .catch(() => { /* offline: letters */ });
  }, [fromSite?.version]);
  if (fromSite?.version) return fromSite;
  return { cdn: version ? DDRAGON : null, version };
}

/** The official item and champion catalog (English) for the current patch, from Data Dragon. */
export function useCatalog(art: Art): Catalog | null {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    if (!art.cdn || !art.version) return;
    let stopped = false;
    const base = `${art.cdn}/cdn/${art.version}/data/en_US`;
    Promise.all([fetch(`${base}/item.json`), fetch(`${base}/champion.json`)])
      .then(([i, c]) => (i.ok && c.ok ? Promise.all([i.json(), c.json()]) : Promise.reject(new Error("catalog"))))
      .then(([items, champs]) => { if (!stopped) setCatalog(parseCatalog(items, champs)); })
      .catch(() => { /* offline: the Objetos tab explains it */ });
    return () => { stopped = true; };
  }, [art.cdn, art.version]);
  return catalog;
}

export function ChampArt({ id, name, size, art }: { id: string; name: string; size: number; art: Art }) {
  const [failed, setFailed] = useState(false);
  const src = art.cdn && art.version ? `${art.cdn}/cdn/${art.version}/img/champion/${id}.png` : null;
  if (!src || failed) return <span className="champ champ-letter" style={{ width: size, height: size }} role="img" aria-label={name}>{name.slice(0, 1)}</span>;
  return <img className="champ" src={src} alt={name} width={size} height={size} onError={() => setFailed(true)} />;
}

export function ItemArt({ id, name, size, art, owned }: { id: number; name: string; size: number; art: Art; owned?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = art.cdn && art.version ? `${art.cdn}/cdn/${art.version}/img/item/${id}.png` : null;
  const cls = `item${owned ? " item-owned" : ""}`;
  if (!src || failed) return <span className={`${cls} item-letter`} style={{ width: size, height: size }} role="img" aria-label={name} title={name}>{name.slice(0, 1)}</span>;
  return <img className={cls} src={src} alt={name} title={name} width={size} height={size} onError={() => setFailed(true)} />;
}

function Items({ ids, names, art }: { ids: number[]; names: Map<number, string>; art: Art }) {
  const slots = [...ids.slice(0, 7), ...Array<number | null>(Math.max(0, 7 - ids.length)).fill(null)];
  return (
    <span className="items">
      {slots.map((id, i) => id === null
        ? <span key={`e${i}`} className="item item-empty" aria-hidden="true" />
        : <ItemArt key={`${id}-${i}`} id={id} name={names.get(id) ?? `Item ${id}`} size={20} art={art} />)}
    </span>
  );
}

function PlayerRow({ p, names, art, me }: { p: PlayerState; names: Map<number, string>; art: Art; me?: boolean }) {
  return (
    <li className={`player${me ? " player-me" : ""}${p.isDead ? " player-dead" : ""}`}>
      <span className="player-art">
        <ChampArt id={p.championId} name={p.champion} size={32} art={art} />
        <span className="player-level" aria-label={`Level ${p.level}`}>{p.level}</span>
      </span>
      <span className="player-main">
        <span className="player-name" title={p.name}>{me ? "You" : p.name.split("#")[0] || p.champion}</span>
        <span className="player-kda">{p.champion} · {p.kills}/{p.deaths}/{p.assists} · {p.cs} CS</span>
      </span>
      <Items ids={p.items} names={names} art={art} />
    </li>
  );
}

export interface BuildItem { id: number; name: string; games: number; wins: number }
export interface PersonalBuild { champion: string; games: number; wins: number; items: BuildItem[]; note: string | null; skillOrders?: number[][] }

// Reasons go from the generic ("gives ability power") to the specific (the enemy team); a
// one-line alternative shows the most specific one.
function Reasons({ s }: { s: Suggestion }) {
  return <ul className="reasons">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>;
}

/** Recipe with the pieces you already have ticked, and what your gold buys right now. */
function HowToBuy({ s, gold, art }: { s: Suggestion; gold: number | null; art: Art }) {
  const { steps, remaining, affordableNow } = s.path;
  return (
    <div className="howto">
      {steps.length > 0 && (
        <div className="recipe" aria-label="Components">
          {steps.map((c, i) => (
            <span key={`${c.id}-${i}`} className={`piece${c.owned ? " piece-owned" : ""}`} title={`${c.name} · ${c.gold} gold${c.owned ? " · you have it" : ""}`}>
              <ItemArt id={c.id} name={c.name} size={24} art={art} owned={c.owned} />
              {c.owned && <span className="tick" aria-hidden="true">✓</span>}
            </span>
          ))}
        </div>
      )}
      <p className="quiet">
        {remaining === 0 ? "You have all the pieces." : `You need ${remaining} more gold in total.`}
        {gold !== null && affordableNow && (affordableNow.id === s.item.id
          ? ` Your ${Math.floor(gold)} gold is enough to complete it.`
          : ` Your ${Math.floor(gold)} gold buys: ${affordableNow.name} (${affordableNow.gold}).`)}
        {gold !== null && !affordableNow && remaining > 0 && ` Your ${Math.floor(gold)} gold is not enough for any piece yet.`}
      </p>
    </div>
  );
}

function ItemsTab({ state, coach, build, art, connected, demo, hasCatalog }: {
  state: GameState; coach: LiveCoach; build: PersonalBuild | null | "loading"; art: Art; connected: boolean; demo: boolean; hasCatalog: boolean;
}) {
  const me = state.me!;
  if (demo) return <p className="quiet">In the demo the items are made up, so there are no suggestions. In a real game you will see your next suggested item here and how to buy it.</p>;
  if (!hasCatalog || !coach.items) return <p className="quiet">Loading the patch item catalog… (needs an Internet connection)</p>;
  const s = coach.items;
  const price = (x: Suggestion) => `${x.item.gold} gold`;
  return (
    <div className="suggest">
      {coach.starter && (
        <section className="next" aria-label="Starting items">
          <div className="label">Start with</div>
          <div className="recipe">{coach.starter.items.map((i) => <ItemArt key={i.id} id={i.id} name={i.name} size={32} art={art} />)}</div>
          <div className="next-name">{coach.starter.items.map((i) => i.name).join(" + ")}</div>
          <ul className="reasons">{coach.starter.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {coach.starter.alternatives.length > 0 && <p className="quiet">Also fine: {coach.starter.alternatives.map((a) => a.name).join(", ")}.</p>}
        </section>
      )}
      <p className="quiet enemy-line">
        Enemy damage: {Math.round(s.enemy.magicShare * 100)}% magic · {100 - Math.round(s.enemy.magicShare * 100)}% physical
        {s.enemy.healers.length > 0 && ` · healing: ${s.enemy.healers.join(", ")}`}
      </p>
      {s.next ? (
        <section className="next" aria-label="Next suggested item">
          <div className="next-head">
            <ItemArt id={s.next.item.id} name={s.next.item.name} size={44} art={art} />
            <div>
              <div className="label">{coach.starter ? "Then build towards" : "Next suggested item"}</div>
              <div className="next-name">{s.next.item.name}</div>
              <div className="quiet">{price(s.next)}</div>
            </div>
          </div>
          <Reasons s={s.next} />
          <HowToBuy s={s.next} gold={state.gold} art={art} />
        </section>
      ) : (
        <p className="quiet">{s.note}</p>
      )}
      {s.boots && (
        <section className="alt" aria-label="Suggested boots">
          <ItemArt id={s.boots.item.id} name={s.boots.item.name} size={32} art={art} />
          <div><div className="label">Boots</div><div className="alt-name">{s.boots.item.name}</div><div className="quiet">{s.boots.reasons[0]}</div></div>
        </section>
      )}
      {s.alternatives.map((a) => (
        <section key={a.item.id} className="alt" aria-label={`Alternative: ${a.item.name}`}>
          <ItemArt id={a.item.id} name={a.item.name} size={32} art={art} />
          <div><div className="label">Alternative</div><div className="alt-name">{a.item.name}</div><div className="quiet">{a.reasons.at(-1)}</div></div>
        </section>
      ))}
      <p className="quiet small">Suggestions computed from this game's items and scoreboard and each item's official data. You decide.</p>
      {connected && build && build !== "loading" && build.items.length > 0 && (
        <details className="history">
          <summary>Your history on {me.champion} ({build.games} games)</summary>
          <ul>{build.items.map((i) => <li key={i.id}><ItemArt id={i.id} name={i.name} size={20} art={art} /> {i.name} · {i.games}/{build.games} games · {Math.round((i.wins / i.games) * 100)}% W</li>)}</ul>
        </details>
      )}
    </div>
  );
}

const SLOTS: Slot[] = [1, 2, 3, 4];

function SkillsTab({ state, coach, history, connected }: { state: GameState; coach: LiveCoach; history: Slot[][]; connected: boolean }) {
  const me = state.me!;
  const ranks = state.abilities;
  const max = usualMaxOrder(history);
  const rank = (s: Slot) => (!ranks ? 0 : s === 1 ? ranks.q : s === 2 ? ranks.w : s === 3 ? ranks.e : ranks.r);
  return (
    <div className="suggest">
      {ranks ? (
        <ul className="ranks" aria-label="Your abilities">
          {SLOTS.map((s) => (
            <li key={s} className={coach.skill?.ref === SLOT_KEY[s] ? "rank rank-next" : "rank"}>
              <span className="rank-key">{SLOT_KEY[s]}</span>
              <span className="pips" aria-label={`Rank ${rank(s)}`}>{Array.from({ length: s === 4 ? 3 : 5 }, (_, i) => <span key={i} className={i < rank(s) ? "pip pip-on" : "pip"} />)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="quiet">The game isn't reporting your abilities right now.</p>
      )}
      {coach.skill ? (
        <section className="next" aria-label="Next ability">
          <div className="label">Next ability</div>
          <div className="next-name">{coach.skill.headline.replace("Level up: ", "")}</div>
          <ul className="reasons">{coach.skill.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      ) : state.skillPoints ? (
        <p className="quiet">{history.length < 3
          ? `You have a point to spend. I only suggest basic abilities from your own games with ${me.champion}${connected ? "" : " (connect the website to use your history)"}: play a few more and I will follow your order.`
          : "You have a point to spend."}</p>
      ) : (
        <p className="quiet">No points to spend right now.</p>
      )}
      {max && <p className="quiet">You usually max {max.map((s) => SLOT_KEY[s]).join(" → ")} on {me.champion} ({history.length} games).</p>}
      <p className="quiet small">Your ultimate is suggested as soon as a rank opens (levels 6, 11 and 16). Basic abilities follow your own history with this champion; there is no universal order.</p>
    </div>
  );
}

const k = (n: number) => `${n >= 0 ? "+" : "−"}${(Math.abs(n) / 1000).toFixed(1)}k`;

function GoldTab({ coach, art }: { coach: LiveCoach; art: Art }) {
  const g = coach.gold;
  const o = coach.objectives;
  if (!g) return <p className="quiet">Waiting for the scoreboard…</p>;
  return (
    <div className="suggest">
      <section aria-label="Gold difference">
        <div className="label">Item gold difference</div>
        <ul className="gold-rows">
          {g.rows.map((r) => (
            <li key={`${r.ally.name}-${r.enemy.name}`} className="gold-row">
              <ChampArt id={r.ally.championId} name={r.ally.champion} size={24} art={art} />
              <span className={`gold-diff ${r.diff >= 0 ? "gold-up" : "gold-down"}`}>{k(r.diff)}</span>
              <ChampArt id={r.enemy.championId} name={r.enemy.champion} size={24} art={art} />
            </li>
          ))}
        </ul>
        <p className="gold-total"><span>Your team {Math.round(g.allyTotal / 100) / 10}k</span><span>Enemy {Math.round(g.enemyTotal / 100) / 10}k</span></p>
        <p className="quiet small">By the value of each player's items, as the TAB screen shows; the game doesn't share anyone's gold. {g.pairedBy === "order" ? "No lanes in this mode: players are paired in list order." : ""}</p>
      </section>
      {o && (
        <section aria-label="Objectives">
          <div className="label">Objectives</div>
          <table className="obj">
            <thead><tr><th scope="col"></th><th scope="col">Your team</th><th scope="col">Enemy</th></tr></thead>
            <tbody>
              <tr><th scope="row">Dragons</th><td>{o.ally.dragons.length}</td><td>{o.enemy.dragons.length}</td></tr>
              <tr><th scope="row">Heralds</th><td>{o.ally.heralds}</td><td>{o.enemy.heralds}</td></tr>
              <tr><th scope="row">Barons</th><td>{o.ally.barons}</td><td>{o.enemy.barons}</td></tr>
              <tr><th scope="row">Turrets</th><td>{o.ally.turrets}</td><td>{o.enemy.turrets}</td></tr>
              <tr><th scope="row">Inhibitors</th><td>{o.ally.inhibitors}</td><td>{o.enemy.inhibitors}</td></tr>
            </tbody>
          </table>
        </section>
      )}
      {coach.strategy.length > 0 && <ul className="reasons">{coach.strategy.map((f) => <li key={f.id}>{f.headline}. {f.reasons[0]}</li>)}</ul>}
    </div>
  );
}

type Tab = "items" | "skills" | "gold" | "rivals" | "team";

function NowArt({ d, art, coach }: { d: CoachDecision; art: Art; coach: LiveCoach }) {
  if ((d.kind === "item" || d.kind === "boots") && d.ref) {
    const id = Number(d.ref);
    const name = coach.starter?.items.find((i) => i.id === id)?.name ?? coach.items?.next?.item.name ?? d.headline;
    return <ItemArt id={id} name={name} size={32} art={art} />;
  }
  if (d.kind === "skill" && d.ref) return <span className="rank-key rank-key-big" aria-hidden="true">{d.ref}</span>;
  return null;
}

/** The scoreboard the game already shows (Tab), in the side window, plus the Coach's read of it. */
export function Board({ state, names, art, catalog, build, connected, demo = false, overlay = false }: {
  state: GameState; names: Map<number, string>; art: Art; catalog: Catalog | null; build: PersonalBuild | null | "loading"; connected: boolean; demo?: boolean;
  /** Also feed the optional overlay window (D-11). */
  overlay?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("items");
  const [shownId, setShownId] = useState<string | null>(null);
  const [adjustedId, setAdjustedId] = useState<string | null>(null);
  const previousItem = useRef<number | null>(null);
  const lastItem = useRef<CoachDecision | null>(null);
  const personal = build && build !== "loading" ? build : null;
  const history = (personal?.skillOrders ?? []).filter((o) => o.every((s) => s >= 1 && s <= 4)) as Slot[][];
  const coach = state.me ? liveCoach({
    state,
    catalog: demo ? null : catalog,
    usualItems: personal?.items.map((i) => i.id) ?? [],
    previousItem: previousItem.current,
    skillHistory: history,
  }) : null;
  previousItem.current = coach?.items?.next?.item.id ?? null;
  const now = coach ? pickNow(coach.decisions, shownId) : null;
  const myItems = state.me?.items ?? [];

  // "Coach adjustment": the next-item recommendation changed although the player didn't buy the old
  // one, i.e. the game changed (an enemy bought something, a threat grew). Skills and the opening
  // purchase change on their own and are never flagged.
  const nextItem = coach?.decisions.find((d) => d.id.startsWith("item:")) ?? null;
  useEffect(() => {
    const before = lastItem.current;
    if (nextItem && isAdjustment(before, nextItem) && !(before?.ref && myItems.includes(Number(before.ref)))) setAdjustedId(nextItem.id);
    if (nextItem) lastItem.current = nextItem;
  }, [nextItem?.id]);
  useEffect(() => { if (now) setShownId(now.id); }, [now?.id]);

  // The overlay gets the same numbers as the Gold tab and the next items, on every update.
  useEffect(() => {
    if (!overlay || !coach?.gold) return;
    const g = coach.gold;
    const next = [coach.items?.next, ...(coach.items?.alternatives ?? [])].filter((x) => x != null).slice(0, 3)
      .map((x) => ({ id: x.item.id, name: x.item.name }));
    void sendOverlay({
      art: { cdn: art.cdn, version: art.version },
      rows: g.rows.map((r) => ({ ally: { id: r.ally.championId, name: r.ally.champion }, enemy: { id: r.enemy.championId, name: r.enemy.champion }, diff: r.diff })),
      allyTotal: g.allyTotal,
      enemyTotal: g.enemyTotal,
      next,
      gold: state.gold,
    });
  });

  if (!state.me || !coach) return null;
  const adjusted = now !== null && now.id === adjustedId;
  const tabs: [Tab, string][] = [["items", "Items"], ["skills", "Skills"], ["gold", "Gold"], ["rivals", "Enemies"], ["team", "Team"]];
  return (
    <section className="board" aria-label="Game">
      {now && <CoachCard label="Now" headline={now.headline} reasons={now.reasons} basis={now.basis} adjustment={adjusted} art={<NowArt d={now} art={art} coach={coach} />} />}
      <div className="tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className="tab" onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "rivals" && <ul className="players">{state.enemies.map((p) => <PlayerRow key={p.name || p.champion} p={p} names={names} art={art} />)}</ul>}
        {tab === "team" && (
          <ul className="players">
            <PlayerRow p={state.me} names={names} art={art} me />
            {state.allies.map((p) => <PlayerRow key={p.name || p.champion} p={p} names={names} art={art} />)}
          </ul>
        )}
        {tab === "items" && <ItemsTab state={state} coach={coach} build={build} art={art} connected={connected} demo={demo} hasCatalog={catalog !== null} />}
        {tab === "skills" && <SkillsTab state={state} coach={coach} history={history} connected={connected} />}
        {tab === "gold" && <GoldTab coach={coach} art={art} />}
      </div>
    </section>
  );
}
