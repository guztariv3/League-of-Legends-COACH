import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes } from "react-router";
import { api } from "./api";
import { Coach } from "./components/Coach";
import { CoachAvatar } from "@coach/ui";
import { Loading } from "./components/ui";
import { Champions } from "./pages/Champions";
import { ChampionDetail } from "./pages/ChampionDetail";
import { Profile } from "./pages/Profile";
import { Improve } from "./pages/Improve";
import { Game } from "./pages/Game";
import { MatchReview } from "./pages/MatchReview";
import { SearchBox } from "./components/SearchBox";
import { Dashboard } from "./pages/Dashboard";
import { MatchDetail } from "./pages/MatchDetail";
import { Matches } from "./pages/Matches";
import { Settings } from "./pages/Settings";
import { Welcome } from "./pages/Welcome";
import { SessionProvider, useLoad, useSession } from "./session";
import { ChampionIcon } from "./assets";
import "@coach/ui/fonts.css";
import { AssetsProvider } from "./assets";
import { World } from "./components/World";
import { LegalFooter } from "./components/LegalFooter";
import "./styles.css";

/** Main sections, as the left icon rail (a bottom bar on phones). Simple original line icons, 24×24. */
const NAV: [string, string, string][] = [
  ["/", "Home", "M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  ["/matches", "Matches", "M4 6h16M4 12h16M4 18h16"],
  ["/champions", "Champions", "M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"],
  ["/game", "Pre-game", "M5 4h14v16H5zM10 9l5 3-5 3z"],
  ["/improve", "Improve", "M4 20V11M10 20V5M16 20v-6M2 20h20"],
  ["/profile", "Profile", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"],
];

function Layout() {
  const { me, refresh } = useSession();
  const syncing = me?.accounts.some((a) => a.sync.status === "syncing");
  // The client shows your icon top-right; we show the champion of your latest game.
  const latest = useLoad(() => api.matches({ limit: "1" }), [syncing]);
  const lastChampion = latest.data?.matches[0]?.championId;

  // Sync on open (brief §14); the API skips accounts synced in the last 10 minutes.
  useEffect(() => { api.syncAll().then(() => refresh()).catch(() => {}); }, [refresh]);
  // Poll only while something is syncing.
  useEffect(() => {
    if (!syncing) return;
    const t = setInterval(() => { refresh().catch(() => {}); }, 1500);
    return () => clearInterval(t);
  }, [syncing, refresh]);

  return (
    <>
      <a href="#main" className="visually-hidden">Skip to content</a>
      <div className="app-frame">
        <nav className="rail" aria-label="Main">
          <Link to="/" className="rail-brand" aria-label="KOI Master, home" tabIndex={-1}>
            <span><CoachAvatar quiet /></span>
          </Link>
          <div className="rail-nav">
            {NAV.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === "/"}>
                <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
                <span className="rail-label">{label}</span>
              </NavLink>
            ))}
          </div>
          <span className="rail-spacer" />
        </nav>
        <header className="topbar">
          <Link to="/" className="brand" aria-label="KOI Master, home">KOI MASTER</Link>
          <SearchBox />
          <Link to="/champions" className="topbar-link">Champions</Link>
          <NavLink to="/settings" className="profile" aria-label="Settings and account">
            {lastChampion ? <ChampionIcon champion={lastChampion} size={32} className="portrait" /> : <span className="profile-empty" aria-hidden="true" />}
            <span className="profile-text">
              <span className="profile-name">{me?.accounts[0]?.riotId.split("#")[0] ?? me?.user.displayName}</span>
              <span className="profile-sub">Settings</span>
            </span>
          </NavLink>
        </header>
        <div className="shell">
          <main id="main">
            <Outlet />
          </main>
          <LegalFooter />
        </div>
      </div>
      <Coach />
    </>
  );
}

function App() {
  const { loading, me } = useSession();
  if (loading) return <main className="shell"><Loading /></main>;
  if (!me || me.accounts.length === 0) {
    return (
      <Routes>
        <Route path="*" element={<Welcome />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/link" element={<Welcome />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="matches" element={<Matches />} />
        <Route path="matches/:matchId" element={<MatchDetail />} />
        <Route path="matches/:matchId/review" element={<MatchReview />} />
        <Route path="game" element={<Game />} />
        <Route path="champions" element={<Champions />} />
        <Route path="champions/:name" element={<ChampionDetail />} />
        <Route path="improve" element={<Improve />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <AssetsProvider>
          <World />
          <App />
        </AssetsProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
