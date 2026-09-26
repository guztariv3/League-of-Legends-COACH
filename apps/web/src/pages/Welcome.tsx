import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api";
import { CoachAvatar } from "@coach/ui";
import { LegalFooter } from "../components/LegalFooter";
import { SyntheticBadge } from "../components/ui";
import { useSession } from "../session";

/**
 * Adaptive onboarding (brief §13): sign in → link Riot account → the first 50
 * games sync in the background → straight to the dashboard. No big forms.
 */
export function Welcome() {
  const { config, me, refresh } = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [riotId, setRiotId] = useState("");
  const [platform, setPlatform] = useState("euw1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.devLogin(name.trim() || "Player");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    const [gameName, tagLine] = riotId.split("#").map((s) => s.trim());
    if (!gameName || !tagLine) return setError("Enter your full Riot ID, for example: Name#EUW");
    setBusy(true);
    setError(null);
    try {
      await api.linkAccount(gameName, tagLine, platform);
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link the account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <main className="shell" style={{ maxWidth: 520, paddingTop: "10vh" }}>
        <div className="stack" style={{ alignItems: "center", textAlign: "center", marginBottom: 24 }}>
          <CoachAvatar expression="happy" />
          <h1 className="page-title">KOI Master</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Your personal League analyst. It understands your games and only speaks up when it matters.
          </p>
          {config?.dataSource === "synthetic" && <SyntheticBadge />}
        </div>

        <div className="card stack">
          {!me ? (
            config?.auth.devLogin ? (
              <form className="stack" onSubmit={login}>
                <div className="notice">
                  <strong>Development sign-in.</strong> Riot sign-in (RSO) will be turned on once Riot approves the
                  application. Until then, sign in with a local name.
                </div>
                <div className="field">
                  <label htmlFor="name">Your name</label>
                  <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Player" maxLength={40} autoComplete="nickname" />
                </div>
                <button className="btn btn-primary" disabled={busy}>Sign in</button>
              </form>
            ) : (
              <div className="notice" role="alert">
                Riot sign-in is not available yet. Check back soon.
              </div>
            )
          ) : (
            <form className="stack" onSubmit={link}>
              <p style={{ margin: 0 }}>Link your Riot account. We will analyze your last 50 games.</p>
              <div className="field">
                <label htmlFor="riotid">Riot ID</label>
                <input id="riotid" value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="Name#TAG" required autoComplete="off" />
              </div>
              <div className="field">
                <label htmlFor="platform">Region</label>
                <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {config?.platforms.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <p className="tile-note" style={{ margin: 0 }}>
                The account will be marked as <em>unverified</em> until Riot sign-in is available.
              </p>
              <button className="btn btn-primary" disabled={busy}>{busy ? "Linking…" : "Link and analyze"}</button>
            </form>
          )}
          {error && <p role="alert" style={{ color: "var(--bad)", margin: 0 }}>{error}</p>}
        </div>
      </main>
      <div className="shell" style={{ maxWidth: 520 }}><LegalFooter /></div>
    </>
  );
}
