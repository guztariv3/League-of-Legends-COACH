import { ItemArt, type Art } from "./board";

/** The pre-game build from /api/desktop/plan (see packages/build): every item with its reasons. */
export interface ItemPick { id: number; name: string; gold: number; score: number; why: string[] }
export interface RunePick { id: number; name: string; why: string }
export interface PreGameBuild {
  champion: string;
  economyNotes?: string[];
  kit: string[];
  enemyDamage: { physical: number; magic: number; true: number };
  threats: { kind: string; weight: number; sources: { name: string; why: string }[] }[];
  starter: { items: { id: number; name: string; gold: number }[]; why: string[] } | null;
  first: ItemPick | null;
  next: ItemPick[];
  boots: ItemPick | null;
  situational: (ItemPick & { when: string })[];
  ruledOut: { id: number; name: string; why: string }[];
  /** Runes and summoner spells (packages/build/src/setup.ts). */
  setup?: {
    runes: {
      primaryTree: string; keystone: RunePick; primary: RunePick[];
      secondaryTree: string; secondary: RunePick[]; shards: RunePick[];
    } | null;
    spells: { id: string; key: number; name: string; why: string }[];
  };
  /** How sure the first item is, its close runner-up and the standard core it replaces (phase 3). */
  certainty?: "strong" | "preferred" | "close" | null;
  alternative?: (ItemPick & { difference: string }) | null;
  adaptation?: { standard: boolean; standardCore: { id: number; name: string }[]; note: string } | null;
  /** What your team needs from you, from your allies' kits (packages/build/src/team.ts). */
  team?: { id: string; text: string; why: string }[];
  /** What Master+ players do with this champion this patch (phase 4): evidence, never the decision. */
  stats?: MasterStats | null;
  /** On a close call, which option is nearer to how the player plays (phase 5); both are valid. */
  styleNote?: string | null;
  version: string;
  enemiesKnown: number;
  attribution: { text: string; license: string };
}

type Share = { games: number; share: number; winRate: number };
export interface MasterStats {
  patch: string;
  patchLabel: "current" | "previous";
  position: string;
  games: number;
  firstItem: ({ id: number; name: string; avgMinute: number | null } & Share) | null;
  core: ({ items: { id: number; name: string }[] } & Share) | null;
  keystone: ({ id: number; name: string; secondaryTree: string | null } & Share) | null;
  spells: ({ names: string[] } & Share) | null;
  skills: ({ max: ("Q" | "W" | "E")[]; sequence: number[] | null } & Share) | null;
  matchup: { opponent: string; games: number; winRate: number } | null;
  notes: string[];
}

const POSITION: Record<string, string> = { TOP: "top", JUNGLE: "jungle", MIDDLE: "mid", BOTTOM: "bot", UTILITY: "support" };

/** Master+ statistics beside the coach's build: every figure with its sample and patch. */
export function MasterStatsView({ stats, art }: { stats: MasterStats; art: Art }) {
  const games = (o: Share) => `${pct(o.share)} of ${stats.games} games`;
  return (
    <details className="prebuild-block master" aria-label="Master+ this patch">
      <summary className="bar">
        <span className="prebuild-title">Master+ {stats.patchLabel === "current" ? "this patch" : "last patch"}</span>
        <span className="quiet small">Patch {stats.patch}{stats.patchLabel === "previous" ? " (previous)" : ""} · {POSITION[stats.position] ?? stats.position} · {stats.games} ranked games</span>
      </summary>
      <ul className="reasons">
        {stats.firstItem && (
          <li className="bar">
            <ItemArt id={stats.firstItem.id} name={stats.firstItem.name} size={20} art={art} />
            <span>First item: <strong>{stats.firstItem.name}</strong>{stats.firstItem.avgMinute !== null ? `, done around minute ${Math.round(stats.firstItem.avgMinute)}` : ""} <span className="quiet">({games(stats.firstItem)})</span></span>
          </li>
        )}
        {stats.core && <li>Core: <strong>{stats.core.items.map((i) => i.name).join(" → ")}</strong> <span className="quiet">({games(stats.core)})</span></li>}
        {stats.keystone && <li>Keystone: <strong>{stats.keystone.name}</strong>{stats.keystone.secondaryTree ? ` + ${stats.keystone.secondaryTree}` : ""} <span className="quiet">({games(stats.keystone)})</span></li>}
        {stats.spells && <li>Spells: <strong>{stats.spells.names.join(" + ")}</strong> <span className="quiet">({games(stats.spells)})</span></li>}
        {stats.skills && <li>Max order: <strong>{stats.skills.max.join(" → ")}</strong> <span className="quiet">({games(stats.skills)})</span></li>}
        {stats.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
      <p className="quiet small">What Master+ players did in ranked solo games, counted from the official Riot API. It shows what is common, not what is right for this game: the build above is worked out for your enemies.</p>
    </details>
  );
}

const THREAT_LABEL: Record<string, string> = {
  crit: "Critical strikes", healing: "Healing", shields: "Shields", cc: "Crowd control",
  tanks: "Tanky champions", attackSpeed: "Basic attacks", burst: "Burst damage",
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** How the certainty reads: never a number, never more sure than the scores allow. */
export const CERTAINTY: Record<"strong" | "preferred" | "close", string> = {
  strong: "Strong recommendation",
  preferred: "Preferred option",
  close: "Close call",
};

/** Starting items grouped: "Doran's Ring + 2 × Health Potion". */
function starterLine(items: { id: number; name: string }[]) {
  const groups: { id: number; name: string; n: number }[] = [];
  for (const i of items) {
    const g = groups.find((x) => x.id === i.id);
    if (g) g.n++; else groups.push({ ...i, n: 1 });
  }
  return groups;
}

export function PreGameBuildView({ build, art }: { build: PreGameBuild; art: Art }) {
  const { first } = build;
  return (
    <section className="prebuild" aria-label="Build for this game">
      <h3 className="label">Build for this game</h3>
      {build.economyNotes && <details className="prebuild-block"><summary>Economy and recall scenarios</summary>{build.economyNotes.map((line,i)=><p key={i}>{line}</p>)}</details>}
      {build.enemiesKnown < 5 && (
        <p className="quiet small">
          {build.enemiesKnown === 0
            ? "Enemy champions aren't visible yet: this reads your champion's kit only and updates as they lock in."
            : `${build.enemiesKnown} of 5 enemy champions known: it updates as the rest lock in.`}
        </p>
      )}

      {build.team && build.team.length > 0 && (
        <div className="prebuild-block" aria-label="Your team">
          <span className="label">Your team</span>
          <ul className="reasons">{build.team.map((n) => <li key={n.id}><strong>{n.text}.</strong> {n.why}</li>)}</ul>
        </div>
      )}

      {build.setup && (build.setup.spells.length > 0 || build.setup.runes) && (
        <div className="prebuild-block" aria-label="Runes and summoner spells">
          {build.setup.spells.length > 0 && (
            <details>
              <summary className="bar">
                <span className="prebuild-title">Spells</span>
                <strong>{build.setup.spells.map((s) => s.name).join(" + ")}</strong>
              </summary>
              <ul className="reasons">{build.setup.spells.map((s) => <li key={s.id}><strong>{s.name}</strong>: {s.why}</li>)}</ul>
            </details>
          )}
          {build.setup.runes && (
            <details>
              <summary className="bar">
                <span className="prebuild-title">Runes</span>
                <strong>{build.setup.runes.keystone.name}</strong>
                <span className="quiet small">{build.setup.runes.primaryTree} + {build.setup.runes.secondaryTree}</span>
              </summary>
              <ul className="reasons">
                {[build.setup.runes.keystone, ...build.setup.runes.primary].map((r) => <li key={r.id}><strong>{r.name}</strong>: {r.why}</li>)}
                {build.setup.runes.secondary.map((r) => <li key={r.id}><strong>{r.name}</strong> ({build.setup!.runes!.secondaryTree}): {r.why}</li>)}
                <li>Shards: {build.setup.runes.shards.map((r) => r.name).join(" · ")}</li>
              </ul>
            </details>
          )}
        </div>
      )}

      {build.starter && (
        <details className="prebuild-block">
          <summary className="bar">
            <span className="prebuild-title">Start</span>
            {starterLine(build.starter.items).map((g) => (
              <span key={g.id} className="prebuild-item">
                <ItemArt id={g.id} name={g.name} size={24} art={art} />
                <span>{g.n > 1 ? `${g.n} × ` : ""}{g.name}</span>
              </span>
            ))}
          </summary>
          <ul className="reasons">{build.starter.why.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}

      {first && (
        <div className="prebuild-block prebuild-first" aria-label="Recommended first item">
          <div className="prebuild-title">Recommended first item{build.certainty && <span className={`certainty c-${build.certainty}`}>{CERTAINTY[build.certainty]}</span>}</div>
          <div className="bar">
            <ItemArt id={first.id} name={first.name} size={36} art={art} />
            <strong>{first.name}</strong>
            <span className="quiet small">{first.gold} gold</span>
          </div>
          {build.adaptation && <p className={`adapt${build.adaptation.standard ? " adapt-standard" : ""}`}>{build.adaptation.note}</p>}
          <details className="rn-why">
            <summary>Show reasoning</summary>
            <ul className="reasons">{first.why.map((w) => <li key={w}>{w}</li>)}</ul>
          </details>
          {build.alternative && (
            <div className="alt-line" aria-label="Alternative">
              <span className="label">Alternative</span>
              <ItemArt id={build.alternative.id} name={build.alternative.name} size={24} art={art} />
              <span><strong>{build.alternative.name}</strong> <span className="quiet">{build.alternative.difference}</span></span>
            </div>
          )}
          {build.alternative && build.styleNote && <p className="quiet small style-note">{build.styleNote}</p>}
        </div>
      )}

      {(build.next.length > 0 || build.boots) && (
        <div className="prebuild-block">
          <div className="prebuild-title">Then</div>
          <ul className="prebuild-list">
            {[...(build.boots ? [{ ...build.boots, tag: "Boots" }] : []), ...build.next.map((x) => ({ ...x, tag: null as string | null }))].map((x) => (
              <li key={x.id}>
                <details>
                  <summary className="bar">
                    <ItemArt id={x.id} name={x.name} size={24} art={art} />
                    <span>{x.name}</span>
                    {x.tag && <span className="quiet small">{x.tag}</span>}
                  </summary>
                  <ul className="reasons">{x.why.map((w) => <li key={w}>{w}</li>)}</ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      {build.situational.length > 0 && (
        <div className="prebuild-block">
          <div className="prebuild-title">If needed</div>
          <ul className="prebuild-list">
            {build.situational.map((x) => (
              <li key={x.id}>
                <details>
                  <summary className="bar">
                    <ItemArt id={x.id} name={x.name} size={24} art={art} />
                    <span>{x.name}</span>
                  </summary>
                  <p className="quiet small" style={{ margin: 0 }}>{x.when}</p>
                  <ul className="reasons">{x.why.map((w) => <li key={w}>{w}</li>)}</ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      {build.ruledOut.length > 0 && (
        <details className="prebuild-block">
          <summary className="bar"><span className="prebuild-title">Not needed this game</span><span className="quiet small">{build.ruledOut.map((x) => x.name).join(", ")}</span></summary>
          <ul className="reasons">{build.ruledOut.map((x) => <li key={x.id}><strong>{x.name}</strong>: {x.why}</li>)}</ul>
        </details>
      )}

      {build.stats && <MasterStatsView stats={build.stats} art={art} />}

      {build.enemiesKnown > 0 && (
        <details className="prebuild-block">
          <summary className="bar">
            <span className="prebuild-title">Enemy team</span>
            <span className="quiet small">{pct(build.enemyDamage.physical)} physical · {pct(build.enemyDamage.magic)} magic{build.enemyDamage.true >= 0.05 ? ` · ${pct(build.enemyDamage.true)} true` : ""}</span>
          </summary>
          <ul className="reasons">
            {build.threats.slice(0, 5).map((t) => (
              <li key={t.kind}>{THREAT_LABEL[t.kind] ?? t.kind}: {t.sources.slice(0, 3).map((s) => s.name).join(", ")}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="quiet small">
        Worked out for this game from your champion's abilities, the enemy champions and each item's effects (patch {build.version}); no fixed build lists.{" "}
        <a href={build.attribution.license} target="_blank" rel="noreferrer">{build.attribution.text}</a>
      </p>
    </section>
  );
}
