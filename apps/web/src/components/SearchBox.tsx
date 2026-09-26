import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api, type SearchResult } from "../api";

const typeLabel: Record<SearchResult["type"], string> = {
  champion: "Champion",
  matchup: "Enfrentamiento",
  matches: "Matches",
  profile: "Your profile",
  insight: "Coach",
};

/** Smart search: accessible combobox that only navigates (brief §84–85). */
export function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const listId = useId();
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const id = ++seq.current;
    const t = setTimeout(() => {
      api.search(q).then((r) => { if (id === seq.current) { setResults(r.results); setActive(-1); } }).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = (r: SearchResult) => {
    setOpen(false);
    setQ("");
    navigate(r.href);
  };

  return (
    <div className="search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <label htmlFor="global-search" className="visually-hidden">Search</label>
      <input
        id="global-search"
        type="search"
        placeholder="Search: “Ahri vs Zed”, “my last 10”…"
        value={q}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          if (e.key === "Enter") { const r = results[active >= 0 ? active : 0]; if (r) { e.preventDefault(); go(r); } }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && q.trim().length >= 2 && (
        <ul id={listId} role="listbox" className="search-results">
          {results.length === 0 ? (
            <li className="tile-note" style={{ padding: 12 }}>Nothing here. Try a champion, a role or “my last 10 games”.</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.href + r.title}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                className={i === active ? "active" : undefined}
                onMouseDown={(e) => { e.preventDefault(); go(r); }}
              >
                <span className="badge">{typeLabel[r.type]}</span>
                <span className="search-title">{r.title}</span>
                {r.subtitle && <span className="tile-note">{r.subtitle}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
