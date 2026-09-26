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
        <h1 className="page-title">Settings</h1>
      </header>

      <section className="card stack" aria-labelledby="acc-h">
        <h2 id="acc-h">Riot accounts</h2>
        {me!.accounts.map((a) => (
          <div key={a.id} className="row tile">
            <div>
              <div className="match-title">{a.riotId}</div>
              <div className="tile-note">
                {config?.platforms.find((p) => p.id === a.platform)?.label ?? a.platform} · {a.verified ? "verified" : "unverified"}
                {a.sync.status === "error" && ` · sync error: ${a.sync.error}`}
              </div>
            </div>
            <span className="spacer" />
            <label className="row" style={{ margin: 0, gap: 6 }}>
              <input
                type="checkbox"
                checked={a.includeInProfile}
                onChange={async (e) => { await api.updateAccount(a.id, e.target.checked); await refresh(); }}
              />
              Include in my profile
            </label>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirm(`Unlink ${a.riotId}? Its analyzed history in KOI Master will be deleted.`)) return;
                await api.deleteAccount(a.id);
                await refresh();
              }}
            >
              Unlink
            </button>
          </div>
        ))}
        <div>
          <button className="btn" onClick={() => navigate("/link")}>Add another account</button>
        </div>
      </section>

      <DesktopLink />

      <section className="card stack" aria-labelledby="coach-h">
        <h2 id="coach-h">Coach</h2>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="level">Level of detail in explanations</label>
          <select id="level" value={prefs.level} onChange={(e) => savePrefs({ ...prefs, level: e.target.value as Preferences["level"] })}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="expert">Expert</option>
          </select>
        </div>
        <p className="tile-note" role="status" style={{ margin: 0 }}>{saved ? "Saved" : " "}</p>
      </section>

      <section className="card stack" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p className="page-sub" style={{ margin: 0 }}>Your data is private. You can delete all of it whenever you want.</p>
        <div className="row">
          <button className="btn" onClick={async () => { await api.logout(); await refresh(); navigate("/"); }}>Sign out</button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm("Delete your KOI Master account and all your data? This cannot be undone.")) return;
              await api.deleteMe();
              await refresh();
              navigate("/");
            }}
          >
            Delete all my data
          </button>
        </div>
      </section>
    </div>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : "never");

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
      setError("Could not generate the code. Please try again.");
    }
  };

  const left = code ? Math.max(0, Math.round((code.expiresAt - now) / 1000)) : 0;

  return (
    <section className="card stack" aria-labelledby="desk-h">
      <h2 id="desk-h">Desktop app</h2>
      <p className="page-sub" style={{ margin: 0 }}>
        Connect the app so it shows your opponents at the loading screen. In the app, enter this website's address and the code.
        The app never stores your password and can only read the opponent analysis.
      </p>
      {code ? (
        <div className="pair-code" role="status">
          <span className="pair-code-value" aria-label={`Code ${code.code.split("").join(" ")}`}>{code.code}</span>
          <span className="tile-note">Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} · single use</span>
          <span className="tile-note">Address: <code>{window.location.origin}</code></span>
        </div>
      ) : (
        <div><button className="btn btn-primary" onClick={generate}>Generate connection code</button></div>
      )}
      {error && <p className="tile-note" role="alert" style={{ margin: 0 }}>{error}</p>}
      {devices && devices.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <h3 className="tile-note" style={{ margin: 0 }}>Connected apps</h3>
          {devices.map((d) => (
            <div key={d.id} className="row tile">
              <div>
                <div className="match-title">{d.label}</div>
                <div className="tile-note">Connected {when(d.claimedAt)} · last used {when(d.lastUsedAt)}</div>
              </div>
              <span className="spacer" />
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (!confirm(`Disconnect "${d.label}"? The app will stop working until you connect it again.`)) return;
                  await api.desktopRevoke(d.id);
                  await load();
                }}
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
