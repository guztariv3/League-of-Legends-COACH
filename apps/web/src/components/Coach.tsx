import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { api, type Insight } from "../api";
import { useSession } from "../session";
import { CoachAvatar, type Expression } from "@coach/ui";

const MUTE_KEY = "coach.muted";
const SEEN_KEY = "coach.seen";

function readStore<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: session-only */ }
}

/**
 * Global Coach. It speaks only when something important exists and hasn't been
 * seen yet; otherwise it stays a quiet presence (brief §19–20). Clicking the
 * avatar always opens it on demand.
 */
export function Coach() {
  const { me, coachHint } = useSession();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => readStore(MUTE_KEY, false));
  const [explanation, setExplanation] = useState<{ text: string; source: string } | null>(null);
  const [thinking, setThinking] = useState(false);

  const { pathname } = useLocation();
  const onDashboard = pathname === "/";
  const syncing = me?.accounts.find((a) => a.sync.status === "syncing");

  useEffect(() => {
    if (!me || syncing) return;
    api.dashboard().then((d) => {
      const top = d.insights.find((i) => i.priority === "important") ?? null;
      setInsight(top ?? d.insights[0] ?? null);
      const seen = readStore<string[]>(SEEN_KEY, []);
      // The dashboard already shows its insights, so the Coach stays quiet there.
      // Elsewhere it speaks once per unseen important insight.
      if (top && !onDashboard && !seen.includes(top.id) && !readStore(MUTE_KEY, false)) {
        setOpen(true);
        writeStore(SEEN_KEY, [...seen, top.id].slice(-50));
      }
    }).catch(() => setInsight(null));
  }, [me, syncing, onDashboard]);

  useEffect(() => { if (coachHint && !muted) setOpen(true); }, [coachHint, muted]);
  // Navigating closes the bubble: the Coach should never follow the player around covering content.
  useEffect(() => { setOpen(false); setExplanation(null); }, [pathname]);

  if (!me) return null;

  const dismiss = () => {
    setOpen(false);
    setExplanation(null);
    if (insight) writeStore(SEEN_KEY, [...new Set([...readStore<string[]>(SEEN_KEY, []), insight.id])].slice(-50));
  };
  const toggleMute = () => { writeStore(MUTE_KEY, !muted); setMuted(!muted); setOpen(false); };
  const explain = async () => {
    if (!insight) return;
    setThinking(true);
    try { setExplanation(await api.explain(insight.id)); } finally { setThinking(false); }
  };

  const expression: Expression = thinking || syncing ? "thinking" : insight?.priority === "important" ? "concerned" : "idle";
  const message = syncing
    ? `I am analyzing your games${syncing.sync.progress ? ` (${syncing.sync.progress.done}/${syncing.sync.progress.total})` : ""}. Feel free to look around meanwhile.`
    : coachHint ?? insight?.title ?? "Nothing important to mention right now.";

  return (
    <aside className="coach" aria-label="Coach">
      {open && (
        <div className="coach-bubble" role="status" aria-live="polite">
          <p>{explanation ? explanation.text : message}</p>
          <div className="row" style={{ gap: 4 }}>
            {!syncing && !coachHint && insight && !explanation && (
              <button className="btn btn-ghost" onClick={explain} disabled={thinking}>{thinking ? "Thinking…" : "Why?"}</button>
            )}
            <button className="btn btn-ghost" onClick={dismiss}>Got it</button>
            {!syncing && !coachHint && insight && (
              <button className="btn btn-ghost" onClick={async () => { await api.feedback(insight.id, insight.title); setInsight(null); setOpen(false); setExplanation(null); }}>
                Not useful
              </button>
            )}
            <button className="btn btn-ghost" onClick={toggleMute}>{muted ? "Turn on notices" : "Mute"}</button>
          </div>
        </div>
      )}
      <button className="coach-avatar-btn" onClick={() => (open ? dismiss() : setOpen(true))} aria-expanded={open} aria-label={open ? "Close coach" : "Open coach"}>
        <CoachAvatar expression={expression} quiet={!open && (muted || !insight)} />
      </button>
    </aside>
  );
}
