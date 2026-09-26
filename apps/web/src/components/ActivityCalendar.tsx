import { useEffect, useMemo, useRef, useState } from "react";
import type { Improve } from "../api";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const longDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/**
 * Games per day in the viewer's local time (the server only sends timestamps). One
 * sequential hue from light to dark for "more games"; each cell names its day, games and
 * wins, and a list view carries the same data.
 */
export function ActivityCalendar({ activity, days }: { activity: Improve["activity"]; days: number }) {
  const [active, setActive] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // On narrow screens, start at the most recent weeks.
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [activity]);
  const { weeks, byDay, max, summary } = useMemo(() => {
    const byDay = new Map<string, { date: Date; games: number; wins: number }>();
    for (const g of activity) {
      const d = new Date(g.t);
      const k = dayKey(d);
      const e = byDay.get(k) ?? { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), games: 0, wins: 0 };
      e.games++;
      if (g.win && g.analyzable) e.wins++;
      byDay.set(k, e);
    }
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1);
    start.setDate(start.getDate() - start.getDay()); // align to Sunday
    const weeks: Date[][] = [];
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) weeks.push([]);
      weeks.at(-1)!.push(new Date(d));
    }
    const max = Math.max(1, ...[...byDay.values()].map((e) => e.games));
    const last30 = activity.filter((g) => g.t >= Date.now() - 30 * 86_400_000);
    const perDow = DOW.map((_, i) => activity.filter((g) => new Date(g.t).getDay() === i).length);
    const busiest = perDow.indexOf(Math.max(...perDow));
    let streak = 0;
    for (let d = new Date(today); byDay.has(dayKey(d)); d.setDate(d.getDate() - 1)) streak++;
    return { weeks, byDay, max, summary: { last30: last30.length, daysPlayed: byDay.size, busiest: activity.length ? DOW[busiest]! : null, streak } };
  }, [activity, days]);

  const level = (games: number) => (games === 0 ? 0 : Math.min(4, Math.ceil((games / max) * 4)));
  const act = active ? byDay.get(active) : undefined;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="tiles" aria-label="Activity summary">
        <div className="tile"><div className="tile-value">{summary.last30}</div><div className="tile-label">Games in the last 30 days</div></div>
        <div className="tile"><div className="tile-value">{summary.daysPlayed}</div><div className="tile-label">Days played (last {Math.round(days / 30)} months)</div></div>
        <div className="tile"><div className="tile-value">{summary.streak}</div><div className="tile-label">Days in a row, up to today</div></div>
        {summary.busiest && <div className="tile"><div className="tile-value">{summary.busiest}</div><div className="tile-label">Day you play most</div></div>}
      </div>
      <div className="calendar-wrap" ref={scroller}>
        <div className="calendar" role="grid" aria-label={`Games per day, last ${days} days`}>
          <div className="calendar-dows" aria-hidden="true">{DOW.map((d, i) => <span key={d}>{i % 2 ? d : ""}</span>)}</div>
          {weeks.map((w, wi) => (
            <div className="calendar-week" role="row" key={wi}>
              {w.map((d) => {
                const e = byDay.get(dayKey(d));
                const label = `${longDay(d)}: ${e ? `${e.games} ${e.games === 1 ? "game" : "games"}, ${e.wins} ${e.wins === 1 ? "win" : "wins"}` : "no games"}`;
                return (
                  <span key={d.getTime()} role="gridcell" aria-label={label} title={label}
                    className={`calendar-day lvl-${level(e?.games ?? 0)}${active === dayKey(d) ? " is-active" : ""}`}
                    onPointerEnter={() => setActive(dayKey(d))} onPointerLeave={() => setActive(null)} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className="tile-note" role="status" style={{ minHeight: "1.2em" }}>
          {act ? `${longDay(act.date)}: ${act.games} ${act.games === 1 ? "game" : "games"}, ${act.wins} ${act.wins === 1 ? "win" : "wins"}` : "Hover a day for its games."}
        </span>
        <span className="spacer" />
        <span className="calendar-legend tile-note" aria-hidden="true">Fewer {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`calendar-day lvl-${l}`} />)} More</span>
      </div>
      <details className="layer">
        <summary>View as list</summary>
        <ul className="tile-note" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {[...byDay.values()].sort((a, b) => b.date.getTime() - a.date.getTime()).map((e) => (
            <li key={e.date.getTime()}>{longDay(e.date)}: {e.games} {e.games === 1 ? "game" : "games"}, {e.wins} {e.wins === 1 ? "win" : "wins"}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
