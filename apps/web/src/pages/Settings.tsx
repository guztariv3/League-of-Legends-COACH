import { useState } from "react";
import { useNavigate } from "react-router";
import { api, type Preferences } from "../api";
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
                if (!confirm(`¿Desvincular ${a.riotId}? Se borrará su historial analizado en Kairos.`)) return;
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
              if (!confirm("¿Borrar tu cuenta de Kairos y todos tus datos? No se puede deshacer.")) return;
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
