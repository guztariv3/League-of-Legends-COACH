/**
 * Smart search (brief §84–85): a deterministic parser that turns queries such
 * as "Ahri vs Zed", "mis últimas 10 partidas con Ahri" or "¿por qué pierdo la
 * línea?" into navigation results. Items have no page yet, so they are not
 * searchable (no dead-end results). It only searches and navigates; it never
 * executes actions (Search ≠ command center).
 */

export interface SearchResult {
  type: "champion" | "matchup" | "matches" | "profile" | "insight";
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchIndex {
  champions: string[];
  /** Games per champion for the player (used to rank and describe). */
  playerChampions: Map<string, number>;
  /** Games per lane matchup "me|opponent". */
  matchups: Map<string, number>;
  dimensions: { id: string; label: string; headline: string }[];
  insights: { id: string; title: string }[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const ROLES: [RegExp, string, string][] = [
  [/\b(top)\b/, "TOP", "Top"],
  [/\b(jungla|jungle|jg|jungler)\b/, "JUNGLE", "Jungla"],
  [/\b(mid|medio)\b/, "MIDDLE", "Mid"],
  [/\b(adc|bot|tirador)\b/, "BOTTOM", "ADC"],
  [/\b(support|supp|soporte)\b/, "UTILITY", "Support"],
];

const TOPICS: [RegExp, string][] = [
  [/\b(linea|lane|laning|early)\b/, "lane"],
  [/\b(muer\w*|mori\w*|die|deaths?|dying|riesgo)\b/, "risk"],
  [/\b(farm\w*|cs|minions?|subditos?)\b/, "farm"],
  [/\b(vision|wards?|guardianes?)\b/, "vision"],
  [/\b(pelea\w*|teamfights?|tf)\b/, "teamfight"],
  [/\b(remont\w*|comeback|ventaja|lead|throw\w*|delante|detras)\b/, "state"],
  [/\b(campeones|pool|champions)\b/, "pool"],
];

function findChampions(q: string, index: SearchIndex): string[] {
  return index.champions
    .filter((c) => new RegExp(`\\b${norm(c).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q))
    .sort((a, b) => q.indexOf(norm(a)) - q.indexOf(norm(b)));
}

export function search(raw: string, index: SearchIndex): SearchResult[] {
  const q = norm(raw);
  if (q.length < 2) return [];
  const out: SearchResult[] = [];
  const champs = findChampions(q, index);
  const count = Number(/\b(?:ultimas?|last)\s+(\d{1,3})\b/.exec(q)?.[1] ?? NaN);
  const role = ROLES.find(([re]) => re.test(q));
  const result = /\b(victorias|ganadas|wins?|gane)\b/.test(q) ? "win" : /\b(derrotas|perdidas|loss(es)?|perdi)\b/.test(q) ? "loss" : undefined;
  const aram = /\baram\b/.test(q);

  // Matchup: "A vs B" / "A contra B"
  if (champs.length >= 2 && /\b(vs|versus|contra)\b/.test(q)) {
    const [a, b] = champs as [string, string];
    const n = index.matchups.get(`${a}|${b}`) ?? 0;
    out.push({
      type: "matchup",
      title: `${a} contra ${b}`,
      subtitle: n ? `${n} partidas tuyas en este enfrentamiento` : "No tienes partidas en este enfrentamiento",
      href: `/matches?champion=${encodeURIComponent(a)}&opponent=${encodeURIComponent(b)}`,
    });
  }

  // Match list query ("my last 10 games on X", "victorias en mid", "aram")
  const wantsMatches = !Number.isNaN(count) || /\b(partidas|games|historial|matches)\b/.test(q) || result || role || aram;
  if (wantsMatches) {
    const params = new URLSearchParams();
    const parts: string[] = [];
    if (champs[0] && champs.length === 1) { params.set("champion", champs[0]); parts.push(`con ${champs[0]}`); }
    if (role) { params.set("role", role[1]); parts.push(`de ${role[2]}`); }
    if (result) { params.set("result", result); parts.push(result === "win" ? "(victorias)" : "(derrotas)"); }
    if (aram) { params.set("mode", "aram"); parts.push("en ARAM"); }
    if (!Number.isNaN(count)) params.set("limit", String(Math.min(100, count)));
    out.push({
      type: "matches",
      title: `${Number.isNaN(count) ? "Tus partidas" : `Tus últimas ${Math.min(100, count)} partidas`} ${parts.join(" ")}`.trim(),
      href: `/matches?${params}`,
    });
  }

  for (const c of champs.slice(0, 3)) {
    const n = index.playerChampions.get(c) ?? 0;
    out.push({ type: "champion", title: c, subtitle: n ? `${n} partidas tuyas` : "Sin partidas tuyas", href: `/champions/${encodeURIComponent(c)}` });
  }

  for (const [re, id] of TOPICS) {
    if (!re.test(q)) continue;
    const dim = index.dimensions.find((d) => d.id === id);
    if (dim) out.push({ type: "profile", title: dim.label, subtitle: dim.headline, href: `/profile#${id}` });
  }

  const words = q.split(/\s+/).filter((w) => w.length >= 4);
  for (const i of index.insights) {
    if (words.some((w) => norm(i.title).includes(w))) out.push({ type: "insight", title: i.title, href: "/" });
  }

  // Champion name typed partially (no whole-word match yet)
  if (!champs.length && q.length >= 3) {
    for (const c of index.champions.filter((c) => norm(c).startsWith(q)).slice(0, 5)) {
      const n = index.playerChampions.get(c) ?? 0;
      out.push({ type: "champion", title: c, subtitle: n ? `${n} partidas tuyas` : "Sin partidas tuyas", href: `/champions/${encodeURIComponent(c)}` });
    }
  }

  const seen = new Set<string>();
  return out.filter((r) => !seen.has(r.href + r.title) && seen.add(r.href + r.title)).slice(0, 8);
}
