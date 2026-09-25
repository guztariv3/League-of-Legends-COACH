import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, type DesktopDevice, type Preferences } from "../api";
import { useSession } from "../session";

/** Accounts, a couple of preferences and data deletion. Nothing more. */
export function Settings() {
  const { me, config, refresh } = useSession();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Preferences>(me!.preferences);
  const [saved, setSaved] = useState(false);

  const savePrefs = async (next: Preferences) => {
    setPrefs(next);
    await api.savePreferences(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1 className="page-title">Ajustes</h1>
      </header>

      <section className="card stack" aria-labelledby="acc-h">
        <h2 id="acc-h">Cuentas de Riot</h2>
        {me!.accounts.map((a) => (
          <div key={a.id} className="row tile">
            <div>
              <div className="match-title">{a.riotId}</div>
              <div className="tile-note">
                {config?.platforms.find((p) => p.id === a.platform)?.label ?? a.platform} · {a.verified ? "verificada" : "no verificada"}
                {a.sync.status === "error" && ` · error de sincronización: ${a.sync.error}`}
              </div>
            </div>
            <span className="spacer" />
            <label className="row" style={{ margin: 0, gap: 6 }}>
              <input
                type="checkbox"
                checked={a.includeInProfile}
                onChange={async (e) => { await api.updateAccount(a.id, e.target.checked); await refresh(); }}
              />
              Incluir en mi perfil
            </label>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirm(`¿Desvincular ${a.riotId}? Se borrará su historial analizado en KOI Master.`)) return;
                await api.deleteAccount(a.id);
                await refresh();
              }}
            >
              Desvincular
            </button>
          </div>
        ))}
        <div>
          <button className="btn" onClick={() => navigate("/link")}>Añadir otra cuenta</button>
        </div>
      </section>

      <DesktopLink />

      <section className="card stack" aria-labelledby="coach-h">
        <h2 id="coach-h">Coach</h2>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="level">Nivel de detalle de las explicaciones</label>
          <select id="level" value={prefs.level} onChange={(e) => savePrefs({ ...prefs, level: e.target.value as Preferences["level"] })}>
            <option value="beginner">Principiante</option>
            <option value="intermediate">Intermedio</option>
            <option value="advanced">Avanzado</option>
            <option value="expert">Experto</option>
          </select>
        </div>
        <p className="tile-note" role="status" style={{ margin: 0 }}>{saved ? "Guardado" : " "}</p>
      </section>

      <section className="card stack" aria-labelledby="data-h">
        <h2 id="data-h">Tus datos</h2>
        <p className="page-sub" style={{ margin: 0 }}>Tus datos son privados. Puedes borrarlo todo cuando quieras.</p>
        <div className="row">
          <button className="btn" onClick={async () => { await api.logout(); await refresh(); navigate("/"); }}>Cerrar sesión</button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm("¿Borrar tu cuenta de KOI Master y todos tus datos? No se puede deshacer.")) return;
              await api.deleteMe();
              await refresh();
              navigate("/");
            }}
          >
            Borrar todos mis datos
          </button>
        </div>
      </section>
    </div>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "nunca");

/** Connect the desktop app with a one-time code; the app never sees the site password. */
function DesktopLink() {
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [devices, setDevices] = useState<DesktopDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = () => api.desktopDevices().then((r) => setDevices(r.devices)).catch(() => setDevices([]));
  useEffect(() => { load(); }, []);
  // While a code is showing, tick the countdown and watch for the app to claim it.
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= code.expiresAt) setCode(null);
    }, 1000);
    const p = setInterval(load, 5000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [code]);

  const generate = async () => {
    setError(null);
    try {
      const r = await api.desktopPair();
      setCode({ code: r.code, expiresAt: Date.now() + r.expiresInSec * 1000 });
      setNow(Date.now());
    } catch {
      setError("No se pudo generar el código. Inténtalo de nuevo.");
    }
  };

  const left = code ? Math.max(0, Math.round((code.expiresAt - now) / 1000)) : 0;

  return (
    <section className="card stack" aria-labelledby="desk-h">
      <h2 id="desk-h">App de escritorio</h2>
      <p className="page-sub" style={{ margin: 0 }}>
        Conecta la app para que te muestre a tus rivales en la pantalla de carga. Escribe en la app la dirección de esta web y el código.
        La app no guarda tu contraseña y solo puede leer el análisis de rivales.
      </p>
      {code ? (
        <div className="pair-code" role="status">
          <span className="pair-code-value" aria-label={`Código ${code.code.split("").join(" ")}`}>{code.code}</span>
          <span className="tile-note">Caduca en {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} · un solo uso</span>
          <span className="tile-note">Dirección: <code>{window.location.origin}</code></span>
        </div>
      ) : (
        <div><button className="btn btn-primary" onClick={generate}>Generar código de conexión</button></div>
      )}
      {error && <p className="tile-note" role="alert" style={{ margin: 0 }}>{error}</p>}
      {devices && devices.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <h3 className="tile-note" style={{ margin: 0 }}>Apps conectadas</h3>
          {devices.map((d) => (
            <div key={d.id} className="row tile">
              <div>
                <div className="match-title">{d.label}</div>
                <div className="tile-note">Conectada {when(d.claimedAt)} · último uso {when(d.lastUsedAt)}</div>
              </div>
              <span className="spacer" />
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (!confirm(`¿Desconectar "${d.label}"? La app dejará de funcionar hasta que la vuelvas a conectar.`)) return;
                  await api.desktopRevoke(d.id);
                  await load();
                }}
              >
                Desconectar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
