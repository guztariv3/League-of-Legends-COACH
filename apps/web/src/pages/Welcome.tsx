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
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

  const account = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") await api.register(username.trim(), password);
      else await api.signIn(username.trim(), password);
      setPassword("");
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
            <>
              <div className="tabs-row" role="tablist" aria-label="Account" style={{ marginBottom: 0 }}>
                <button type="button" role="tab" aria-selected={mode === "signin"} className={`tab-btn${mode === "signin" ? " tab-btn-on" : ""}`} onClick={() => { setMode("signin"); setError(null); }}>Sign in</button>
                <button type="button" role="tab" aria-selected={mode === "register"} className={`tab-btn${mode === "register" ? " tab-btn-on" : ""}`} onClick={() => { setMode("register"); setError(null); }}>Create account</button>
              </div>
              <form className="stack" onSubmit={account} aria-label={mode === "signin" ? "Sign in" : "Create account"}>
                <div className="field">
                  <label htmlFor="username">Username</label>
                  <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={24} autoComplete="username" autoCapitalize="none" spellCheck={false} />
                </div>
                <div className="field">
                  <label htmlFor="password">Password</label>
                  <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "register" ? 10 : 1} maxLength={128} autoComplete={mode === "register" ? "new-password" : "current-password"} />
                </div>
                {mode === "register" && <p className="tile-note" style={{ margin: 0 }}>At least 10 characters. Only you can open your profile with it; we store a one-way hash, never the password.</p>}
                <button className="btn btn-primary" disabled={busy}>{busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}</button>
              </form>
              {config?.auth.devLogin && (
                <details className="layer">
                  <summary>Development sign-in (private prototype only)</summary>
                  <form className="stack" onSubmit={login} style={{ marginTop: 8 }}>
                    <div className="field">
                      <label htmlFor="name">Your name</label>
                      <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Player" maxLength={40} autoComplete="nickname" />
                    </div>
                    <button className="btn" disabled={busy}>Sign in with a name</button>
                  </form>
                </details>
              )}
            </>
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
