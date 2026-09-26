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

/** Main sections. The icons only show in the phone bottom bar (simple original glyphs, 24×24). */
const NAV: [string, string, string][] = [
  ["/", "Home", "M4 11 12 4l8 7v9h-5v-6H9v6H4z"],
  ["/matches", "Matches", "M5 5h14v3H5zm0 5.5h14v3H5zM5 16h14v3H5z"],
  ["/champions", "Champions", "M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"],
  ["/game", "Pre-game", "M12 2 4 12l8 10 8-10zm0 5 4 5-4 5-4-5z"],
  ["/improve", "Improve", "M3 20h18v2H3zM5 17l5-6 4 3 5-8 2 1.3-6.4 10.2L10.3 14 6.6 18.4z"],
  ["/profile", "Profile", "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9m-8 9c0-4.4 3.6-7 8-7s8 2.6 8 7z"],
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
      <div className="shell">
        <header className="topbar">
          <Link to="/" className="brand" aria-label="KOI Master, home">
            <span style={{ width: 28, height: 28, display: "inline-flex" }}><CoachAvatar quiet /></span>
            KOI MASTER
          </Link>
          <nav className="nav nav-app" aria-label="Main">
            {NAV.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === "/"}>
                <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <SearchBox />
          <NavLink to="/settings" className="profile" aria-label="Settings and account">
            {lastChampion ? <ChampionIcon champion={lastChampion} size={40} className="portrait" /> : <span className="profile-empty" aria-hidden="true" />}
            <span className="profile-text">
              <span className="profile-name">{me?.accounts[0]?.riotId.split("#")[0] ?? me?.user.displayName}</span>
              <span className="profile-sub">Settings</span>
            </span>
          </NavLink>
        </header>
        <main id="main">
          <Outlet />
        </main>
        <LegalFooter />
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
