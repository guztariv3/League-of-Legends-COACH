import { useState } from "react";
import { Link } from "react-router";
import type { PoolEntry, PoolVerdict } from "../api";
import { ChampionIcon } from "../assets";
import { num, pct } from "./ui";

const VERDICT: Record<PoolVerdict, { label: string; cls: string }> = {
  strong: { label: "▲ Clearly winning", cls: "trend-improving" },
  weak: { label: "▼ Clearly losing", cls: "trend-declining" },
  even: { label: "Not clearly above or below 50%", cls: "" },
  few: { label: "Fewer than 5 games", cls: "" },
};
const signed = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : ""}${Math.round(x)}`);
const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/** Your champions or lane opponents with games, wins and a verdict only when the numbers clearly say so. */
export function PoolTable({ title, entries, what, empty, note }: { title: string; entries: PoolEntry[]; what: "champion" | "opponent"; empty: string; note: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, 15);
  return (
    <section className="card stack" aria-labelledby={`h-pool-${what}`}>
      <h2 id={`h-pool-${what}`}>{title}</h2>
      {entries.length === 0 ? <p className="tile-note" style={{ margin: 0 }}>{empty}</p> : (
        <>
          <div className="table-scroll">
            <table className="pool-table">
              <thead>
                <tr>
                  <th>{what === "champion" ? "Champion" : "Opponent"}</th><th>Games</th><th>Wins</th><th>Verdict</th><th>KDA</th>
                  {what === "champion" ? <><th>CS/min</th><th>Gold @15</th><th>Last played</th></> : <><th>Gold @15</th><th>CS @15</th></>}
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.name}>
                    <td>
                      <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <ChampionIcon champion={e.name} size={28} />
                        {what === "champion"
                          ? <Link to={`/champions/${encodeURIComponent(e.name)}`}>{e.name}</Link>
                          : <Link to={`/matches?opponent=${encodeURIComponent(e.name)}`}>{e.name}</Link>}
                      </span>
                    </td>
                    <td>{e.games}</td>
                    <td title={e.games >= 5 ? `Likely range ${pct(e.interval.low)}–${pct(e.interval.high)}` : undefined}>{pct(e.wins / e.games)} <span className="tile-note">({e.wins})</span></td>
                    <td className={VERDICT[e.verdict].cls}>{VERDICT[e.verdict].label}</td>
                    <td>{num(e.kda, 2)}</td>
                    {what === "champion"
                      ? <><td>{num(e.csPerMin)}</td><td>{signed(e.goldDiff15)}</td><td className="tile-note">{ago(e.lastPlayed)}</td></>
                      : <><td>{signed(e.goldDiff15)}</td><td>{signed(e.csDiff15)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length > 15 && <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${entries.length}`}</button>}
        </>
      )}
      <p className="tile-note" style={{ margin: 0 }}>{note}</p>
    </section>
  );
}
