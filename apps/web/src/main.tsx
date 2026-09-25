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
import { Game } from "./pages/Game";
import { MatchReview } from "./pages/MatchReview";
import { SearchBox } from "./components/SearchBox";
import { Dashboard } from "./pages/Dashboard";
import { MatchDetail } from "./pages/MatchDetail";
import { Matches } from "./pages/Matches";
import { Settings } from "./pages/Settings";
import { Welcome } from "./pages/Welcome";
import { SessionProvider, useSession } from "./session";
import "./styles.css";

function Layout() {
  const { me, refresh } = useSession();
  const syncing = me?.accounts.some((a) => a.sync.status === "syncing");

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
      <a href="#main" className="visually-hidden">Saltar al contenido</a>
      <div className="shell">
        <header className="topbar">
          <Link to="/" className="brand" aria-label="KOI Master, inicio">
            <span style={{ width: 28, height: 28, display: "inline-flex" }}><CoachAvatar quiet /></span>
            KOI MASTER
          </Link>
          <nav className="nav" aria-label="Principal">
            <NavLink to="/" end>Inicio</NavLink>
            <NavLink to="/matches">Partidas</NavLink>
            <NavLink to="/champions">Campeones</NavLink>
            <NavLink to="/game">Antes de jugar</NavLink>
            <NavLink to="/profile">Perfil</NavLink>
          </nav>
          <SearchBox />
          <NavLink to="/settings" className="btn btn-ghost">Ajustes</NavLink>
        </header>
        <main id="main">
          <Outlet />
        </main>
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
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
