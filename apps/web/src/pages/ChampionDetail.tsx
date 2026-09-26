import { useEffect, useState } from "react";
import { AbilityIcon, ChampionIcon, ItemIcon } from "../assets";
import { SplashBackdrop } from "../components/World";
import { Link, useParams } from "react-router";
import { api, type ChampionDetail as Detail } from "../api";
import { ErrorNotice, Loading, modeLabel, pct, StatTile } from "../components/ui";
import { useLoad, useSession } from "../session";

const verdictText = { better: "▲ better than the rest", worse: "▼ worse than the rest", similar: "similar to the rest" } as const;

/** Champion page with the personal layer: how this champion works *for you* (brief §57). */
export function ChampionDetail() {
  const { name = "" } = useParams();
  const { setCoachHint } = useSession();
  const { data, error, loading } = useLoad(() => api.champion(name), [name]);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!data) return;
    const worse = data.personal.comparisons.filter((c) => c.verdict === "worse").map((c) => c.label.toLowerCase());
    setCoachHint(
      data.personal.games < 5
        ? null
        : worse.length
          ? `On ${data.champion?.name ?? name}, your ${worse.join(" and your ")} ${worse.length > 1 ? "are" : "is"} below what you do on other champions.`
          : null,
    );
    return () => setCoachHint(null);
  }, [data, name, setCoachHint]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return null;
  const { personal } = data;
  const champName = data.champion?.name ?? name;
  // Filters use Riot's champion id (e.g. "MonkeyKing"), not the display name ("Wukong").
  const champId = data.champion?.id ?? name;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <SplashBackdrop champion={champId} />
      <Link to="/champions">← Champions</Link>
      <header className="hero">
        <ChampionIcon champion={champId} size={84} className="portrait" />
        <div>
        <h1 className="page-title">{champName}</h1>
        <p className="page-sub" style={{ margin: 0 }}>
          {data.champion ? `${data.champion.title} · ${data.champion.tags.join(", ")}` : "No static data in the active version"}
          {data.knowledgeVersion && ` · data from version ${data.knowledgeVersion}`}
        </p>
        </div>
      </header>

      <div className="tabs-row" role="tablist" aria-label="Champion sections">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab-btn${tab === key ? " tab-btn-on" : ""}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <Overview data={data} />}
      {tab === "build" && <Build data={data} />}
      {tab === "skills" && <Skills data={data} />}
      {tab === "matchups" && <Matchups data={data} champId={champId} />}

      {tab === "stats" && (personal.games === 0 ? (
        <div className="notice">You have not played {champName} yet, so there is no personal layer.</div>
      ) : (
        <>
          <section className="tiles" aria-label="Your history">
            <StatTile
              label="Wins"
              value={`${personal.wins}/${personal.games}`}
              note={personal.games >= 5 ? `likely range ${pct(personal.interval.low)}–${pct(personal.interval.high)}` : "small sample"}
            />
          </section>

          {personal.comparisons.length > 0 && (
            <section className="card stack" aria-labelledby="h-cmp">
              <h2 id="h-cmp">{champName} vs your other champions (Rift)</h2>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Metric</th><th>{champName}</th><th>Others</th><th>Difference</th></tr></thead>
                  <tbody>
                    {personal.comparisons.map((c) => (
                      <tr key={c.label}>
                        <td>{c.label}</td>
                        <td>{c.value}</td>
                        <td>{c.others ?? "—"}</td>
                        <td className={c.verdict === "better" ? "trend-improving" : c.verdict === "worse" ? "trend-declining" : undefined}>{verdictText[c.verdict]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tile-note" style={{ margin: 0 }}>“Better” or “worse” is only shown when the difference exceeds normal game-to-game variation.</p>
            </section>
          )}

          <section className="card stack" aria-labelledby="h-recent">
            <h2 id="h-recent">Recent games</h2>
            <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
              {personal.recent.map((m) => (
                <li key={m.matchId}>
                  <Link className="tile row" style={{ textDecoration: "none", color: "inherit" }} to={`/matches/${encodeURIComponent(m.matchId)}`}>
                    <span className={`badge ${m.win ? "badge-win" : "badge-loss"}`}>{m.win ? "▲ Victory" : "▼ Defeat"}</span>
                    <span>{m.kills}/{m.deaths}/{m.assists}</span>
                    <span className="spacer" />
                    <span className="tile-note">{modeLabel[m.mode]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ))}
    </div>
  );
}

type Tab = "overview" | "build" | "skills" | "matchups" | "stats";
const TABS: [Tab, string][] = [["overview", "Overview"], ["build", "Build"], ["skills", "Skills"], ["matchups", "Matchups"], ["stats", "Your stats"]];
const PENDING = "Popular builds, win rates and counters from all players arrive with global statistics (a later phase). Until then, everything here is Riot's data or your own games.";

function Rating({ label, value }: { label: string; value: number }) {
  return (
    <div className="rating">
      <span className="tile-note">{label}</span>
      <span className="rating-bar" aria-label={`${label}: ${value} of 10`}><span style={{ width: `${value * 10}%` }} /></span>
    </div>
  );
}

const LANE: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", SUPPORT: "Support" };
const RATING_LABEL = { damage: "Damage", toughness: "Toughness", control: "Crowd control", mobility: "Mobility", utility: "Utility" } as const;
const LEVEL = ["", "Low", "Medium", "High"];
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function Overview({ data }: { data: Detail }) {
  const info = data.champion?.info;
  const ab = data.abilities;
  const wiki = data.wiki;
  const keys = ["P", "Q", "W", "E", "R"] as const;
  const r = wiki?.ratings;
  const rated = r ? (Object.keys(RATING_LABEL) as (keyof typeof RATING_LABEL)[]).map((k) => ({ k, label: RATING_LABEL[k], v: r[k] })) : [];
  return (
    <div className="stack">
      {wiki && (
        <section className="card stack" aria-labelledby="h-playstyle">
          <h2 id="h-playstyle">Playstyle</h2>
          <dl className="setup">
            {wiki.positions.length > 0 && <div><dt>Positions</dt><dd>{wiki.positions.map((p) => LANE[p] ?? titleCase(p)).join(", ")}</dd></div>}
            {wiki.roles.length > 0 && <div><dt>Class</dt><dd>{wiki.roles.map(titleCase).join(", ")}</dd></div>}
            {(wiki.attackType || wiki.adaptiveType) && <div><dt>Attacks</dt><dd>{[wiki.attackType, wiki.adaptiveType && `adaptive ${wiki.adaptiveType.toLowerCase()}`].filter(Boolean).join(" · ")}</dd></div>}
          </dl>
          {rated.length > 0 && (
            <>
              <div className="ratings">
                {rated.map((x) => (
                  <div key={x.k} className="rating">
                    <span className="tile-note">{x.label}: {LEVEL[x.v] ?? x.v}</span>
                    <span className="rating-bar" aria-label={`${x.label}: ${LEVEL[x.v] ?? x.v}`}><span style={{ width: `${(x.v / 3) * 100}%` }} /></span>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0 }}>
                {rated.some((x) => x.v >= 3) && <><strong>Strengths:</strong> {rated.filter((x) => x.v >= 3).map((x) => x.label.toLowerCase()).join(", ")}. </>}
                {rated.some((x) => x.v <= 1) && <><strong>Weaknesses:</strong> {rated.filter((x) => x.v <= 1).map((x) => x.label.toLowerCase()).join(", ")}.</>}
              </p>
            </>
          )}
          <WikiCredit data={data} />
        </section>
      )}
      {info && (
        <section className="card stack" aria-labelledby="h-ratings">
          <h2 id="h-ratings">Riot's ratings</h2>
          <div className="ratings">
            <Rating label="Attack" value={info.attack} />
            <Rating label="Magic" value={info.magic} />
            <Rating label="Defense" value={info.defense} />
            <Rating label="Difficulty" value={info.difficulty} />
          </div>
          <p className="tile-note" style={{ margin: 0 }}>Riot's general 0–10 ratings from Data Dragon; approximate.</p>
        </section>
      )}
      <section className="card stack" aria-labelledby="h-abilities">
        <h2 id="h-abilities">Abilities</h2>
        {ab || wiki ? (
          <ul className="abilities">
            {keys.map((k) => {
              const riot = ab?.abilities.find((x) => x.key === k);
              const w = wiki?.abilities.filter((x) => x.key === k) ?? [];
              if (!riot && !w.length) return null;
              return (
                <li key={k} className="ability">
                  {riot ? <AbilityIcon image={riot.image} passive={k === "P"} label={riot.name} /> : <span className="ability-key" aria-hidden="true">{k}</span>}
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="match-title"><span className="ability-key">{k === "P" ? "Passive" : k}</span> {riot?.name ?? w.map((x) => x.name).join(" / ")}</div>
                    {riot ? <p className="insight-detail" style={{ margin: 0 }}>{riot.description}</p> : w[0]?.blurb && <p className="insight-detail" style={{ margin: 0 }}>{w[0].blurb}</p>}
                    {w.length > 0 ? w.map((x) => <WikiValues key={x.name} a={x} named={w.length > 1} />) : riot && (riot.cooldown || riot.cost || riot.range) && (
                      <div className="tile-note">{[riot.cooldown && `Cooldown ${riot.cooldown}s`, riot.cost && `Cost ${riot.cost}`, riot.range && `Range ${riot.range}`].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="page-sub" style={{ margin: 0 }}>Ability data isn't available right now (it comes from Riot's Data Dragon and the League of Legends Wiki).</p>
        )}
        {wiki && <WikiCredit data={data} />}
      </section>
      {ab && (ab.allyTips.length > 0 || ab.enemyTips.length > 0) && (
        <section className="card stack" aria-labelledby="h-tips">
          <h2 id="h-tips">Riot's tips</h2>
          {ab.allyTips.length > 0 && <><h3 className="tile-label" style={{ margin: 0 }}>Playing as</h3><ul className="tile-note">{ab.allyTips.map((t) => <li key={t}>{t}</li>)}</ul></>}
          {ab.enemyTips.length > 0 && <><h3 className="tile-label" style={{ margin: 0 }}>Playing against</h3><ul className="tile-note">{ab.enemyTips.map((t) => <li key={t}>{t}</li>)}</ul></>}
        </section>
      )}
      <section className="card stack" aria-labelledby="h-guides">
        <h2 id="h-guides">Combos and guides</h2>
        <p className="tile-note" style={{ margin: 0 }}>Not available yet. We only show guides and combos that come from a source we can credit, and we don't write them ourselves.</p>
      </section>
    </div>
  );
}

function WikiValues({ a, named }: { a: NonNullable<Detail["wiki"]>["abilities"][number]; named: boolean }) {
  const facts = [a.damageType, a.targeting && `Targeting: ${a.targeting.toLowerCase()}`, a.cooldown && `Cooldown ${a.cooldown}${/[a-z]/i.test(a.cooldown) ? "" : "s"}`, a.cost && `Cost ${a.cost}`].filter(Boolean);
  const values = a.effects.flatMap((e) => e.values);
  if (!facts.length && !values.length) return null;
  return (
    <div className="wiki-values">
      {named && <div className="tile-label">{a.name}</div>}
      {facts.length > 0 && <div className="tile-note">{facts.join(" · ")}</div>}
      {values.length > 0 && (
        <details className="layer">
          <summary>Values per rank</summary>
          <dl>{values.map((v, i) => <div key={i} style={{ display: "contents" }}><dt>{v.label}</dt><dd>{v.value}</dd></div>)}</dl>
        </details>
      )}
    </div>
  );
}

function WikiCredit({ data }: { data: Detail }) {
  const a = data.wiki?.attribution;
  if (!a) return null;
  return (
    <p className="tile-note" style={{ margin: 0 }}>
      Ability details, positions and ratings: <a href={a.wiki} target="_blank" rel="noreferrer">League of Legends Wiki</a> (<a href={a.license} target="_blank" rel="noreferrer">CC BY-SA 3.0</a>), via <a href={a.meraki} target="_blank" rel="noreferrer">Meraki Analytics</a>.
    </p>
  );
}

function Build({ data }: { data: Detail }) {
  const { loadout: l, build } = data.personal;
  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="h-setup">
        <h2 id="h-setup">Your usual setup (Summoner's Rift)</h2>
        {l.games === 0 ? (
          <p className="page-sub" style={{ margin: 0 }}>No Summoner's Rift games with this champion yet.</p>
        ) : (
          <dl className="setup">
            <div><dt>Keystone</dt><dd>{l.keystone ? `${l.keystone.name} (${l.keystone.games} of ${l.games} games)` : "—"}</dd></div>
            <div><dt>Summoner spells</dt><dd>{l.spells ? `${l.spells.names.join(" + ")} (${l.spells.games} of ${l.games})` : "—"}</dd></div>
            <div><dt>First major item</dt><dd>{l.firstItem ? <><ItemIcon id={l.firstItem.id} size={24} /> {l.firstItem.name}{l.firstItem.medianMinute !== null ? ` · around minute ${Math.round(l.firstItem.medianMinute)}` : ""} ({l.firstItem.games} games)</> : "—"}</dd></div>
          </dl>
        )}
      </section>
      <section className="card stack" aria-labelledby="h-items">
        <h2 id="h-items">Items you finish with</h2>
        {build.items.length ? (
          <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
            {build.items.map((i) => (
              <li key={i.id} className="row"><ItemIcon id={i.id} size={28} /> <span>{i.name}</span><span className="spacer" /><span className="tile-note">{i.games}/{build.games} games · {Math.round((i.wins / i.games) * 100)}% wins</span></li>
            ))}
          </ul>
        ) : <p className="page-sub" style={{ margin: 0 }}>{build.note}</p>}
      </section>
      <div className="coach-plan">
        <h3 className="coach-plan-title">Coach</h3>
        <p style={{ margin: 0 }}>The build that fits a specific game depends on the enemy team. <Link to="/game">Prepare a game</Link> for a plan against real champions, and the desktop app adapts your next item live.</p>
      </div>
      <p className="tile-note" style={{ margin: 0 }}>{PENDING}</p>
    </div>
  );
}

const KEY = ["", "Q", "W", "E", "R"];

function Skills({ data }: { data: Detail }) {
  const order = data.personal.skillOrder;
  const names = new Map((data.abilities?.abilities ?? []).map((a) => [a.key, a.name]));
  return (
    <section className="card stack" aria-labelledby="h-skills">
      <h2 id="h-skills">Your skill order</h2>
      {order ? (
        <>
          <div className="table-scroll">
            <table className="skill-grid">
              <thead><tr><th scope="col">Ability</th>{Array.from({ length: 18 }, (_, i) => <th key={i} scope="col">{i + 1}</th>)}</tr></thead>
              <tbody>
                {[1, 2, 3, 4].map((slot) => (
                  <tr key={slot}>
                    <th scope="row">{KEY[slot]}{names.get(KEY[slot] as "Q") ? ` · ${names.get(KEY[slot] as "Q")}` : ""}</th>
                    {Array.from({ length: 18 }, (_, i) => <td key={i} className={order[i] === slot ? "skill-on" : undefined}>{order[i] === slot ? KEY[slot] : ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.personal.loadout.maxOrder && <p style={{ margin: 0 }}>You usually max <strong>{data.personal.loadout.maxOrder.join(" → ")}</strong>.</p>}
          <p className="tile-note" style={{ margin: 0 }}>The most common choice at each level in your games with this champion. In a game, the desktop app suggests your next point from this, and the ultimate as soon as it opens.</p>
        </>
      ) : (
        <p className="page-sub" style={{ margin: 0 }}>Play at least 3 Summoner's Rift games with this champion and your usual order will appear here.</p>
      )}
      <p className="tile-note" style={{ margin: 0 }}>{PENDING}</p>
    </section>
  );
}

const signed = (n: number | null, digits = 0) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}`);

function Matchups({ data, champId }: { data: Detail; champId: string }) {
  const opp = data.personal.opponents;
  return (
    <section className="card stack" aria-labelledby="h-matchups">
      <h2 id="h-matchups">Your matchups</h2>
      {opp.length ? (
        <div className="table-scroll">
          <table>
            <thead><tr><th scope="col">vs</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">KDA</th><th scope="col">CS diff @15</th><th scope="col">Gold diff @15</th></tr></thead>
            <tbody>
              {opp.map((o) => (
                <tr key={o.opponent}>
                  <td><Link to={`/matches?champion=${encodeURIComponent(champId)}&opponent=${encodeURIComponent(o.opponent)}`} className="row" style={{ gap: 6 }}><ChampionIcon champion={o.opponent} size={24} />{o.opponent}</Link></td>
                  <td>{o.games}{o.games < 5 ? " ·" : ""}</td>
                  <td>{o.wins}/{o.games}</td>
                  <td>{o.kda?.toFixed(1) ?? "—"}</td>
                  <td className={o.csDiff15 !== null && o.csDiff15 < 0 ? "trend-declining" : undefined}>{signed(o.csDiff15)}</td>
                  <td className={o.goldDiff15 !== null && o.goldDiff15 < 0 ? "trend-declining" : undefined}>{signed(o.goldDiff15)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="page-sub" style={{ margin: 0 }}>No lane opponents recorded yet with this champion.</p>}
      <p className="tile-note" style={{ margin: 0 }}>From your Summoner's Rift games only. "·" marks fewer than 5 games: too few to draw conclusions.</p>
    </section>
  );
}
