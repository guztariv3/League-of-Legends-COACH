import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api";
import { CoachAvatar } from "../components/CoachAvatar";
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
      await api.devLogin(name.trim() || "Jugador");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  };

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    const [gameName, tagLine] = riotId.split("#").map((s) => s.trim());
    if (!gameName || !tagLine) return setError("Escribe tu Riot ID completo, por ejemplo: Nombre#EUW");
    setBusy(true);
    setError(null);
    try {
      await api.linkAccount(gameName, tagLine, platform);
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo vincular la cuenta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell" style={{ maxWidth: 520, paddingTop: "10vh" }}>
      <div className="stack" style={{ alignItems: "center", textAlign: "center", marginBottom: 24 }}>
        <CoachAvatar expression="happy" />
        <h1 className="page-title">Kairos Coach</h1>
        <p className="page-sub" style={{ margin: 0 }}>
          Tu analista personal de League. Entiende tus partidas y te avisa solo cuando importa.
        </p>
        {config?.dataSource === "synthetic" && <SyntheticBadge />}
      </div>

      <div className="card stack">
        {!me ? (
          config?.auth.devLogin ? (
            <form className="stack" onSubmit={login}>
              <div className="notice">
                <strong>Inicio de sesión de desarrollo.</strong> El acceso con Riot (RSO) se activará cuando Riot apruebe la
                aplicación. Mientras tanto, entra con un nombre local.
              </div>
              <div className="field">
                <label htmlFor="name">Tu nombre</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jugador" maxLength={40} autoComplete="nickname" />
              </div>
              <button className="btn btn-primary" disabled={busy}>Entrar</button>
            </form>
          ) : (
            <div className="notice" role="alert">
              El inicio de sesión con Riot todavía no está disponible. Vuelve pronto.
            </div>
          )
        ) : (
          <form className="stack" onSubmit={link}>
            <p style={{ margin: 0 }}>Vincula tu cuenta de Riot. Analizaremos tus últimas 50 partidas.</p>
            <div className="field">
              <label htmlFor="riotid">Riot ID</label>
              <input id="riotid" value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="Nombre#TAG" required autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="platform">Región</label>
              <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {config?.platforms.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <p className="tile-note" style={{ margin: 0 }}>
              La cuenta se marcará como <em>no verificada</em> hasta que el inicio de sesión con Riot esté disponible.
            </p>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Vinculando…" : "Vincular y analizar"}</button>
          </form>
        )}
        {error && <p role="alert" style={{ color: "var(--bad)", margin: 0 }}>{error}</p>}
      </div>
      <p className="tile-note" style={{ textAlign: "center", marginTop: 24 }}>
        Kairos Coach isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or anyone officially
        involved in producing or managing Riot Games properties.
      </p>
    </main>
  );
}
