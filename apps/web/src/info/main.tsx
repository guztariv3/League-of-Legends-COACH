import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CoachAvatar } from "@coach/ui";
import "@coach/ui/fonts.css";
import { LegalFooter } from "../components/LegalFooter";
import { World } from "../components/World";
import { Landing } from "./Landing";
import { Privacy } from "./Privacy";
import { Terms } from "./Terms";
import "../styles.css";

/**
 * Public pages, reachable without the prototype password: what KOI Master is, the
 * desktop download, privacy and terms. A separate entry so it needs no session or API.
 */
const pages: Record<string, { title: string; Page: () => React.JSX.Element }> = {
  "": { title: "KOI Master · Your personal League of Legends coach", Page: Landing },
  privacy: { title: "Privacy · KOI Master", Page: Privacy },
  terms: { title: "Terms · KOI Master", Page: Terms },
  // Earlier Spanish addresses keep working.
  privacidad: { title: "Privacy · KOI Master", Page: Privacy },
  terminos: { title: "Terms · KOI Master", Page: Terms },
};

function InfoSite() {
  const slug = location.pathname.replace(/^\/info\/?/, "").replace(/\/$/, "");
  const { title, Page } = pages[slug] ?? pages[""]!;
  document.title = title;
  return (
    <div className="shell">
      <header className="topbar">
        <a href="/info/" className="brand" aria-label="KOI Master, home">
          <span style={{ width: 28, height: 28, display: "inline-flex" }}><CoachAvatar quiet /></span>
          KOI MASTER
        </a>
        <nav className="nav" aria-label="Main">
          <a href="/info/" aria-current={slug === "" ? "page" : undefined}>Home</a>
          <a href="/info/#download">Download</a>
          <a href="/info/privacy" aria-current={slug === "privacy" ? "page" : undefined}>Privacy</a>
          <a href="/info/terms" aria-current={slug === "terms" ? "page" : undefined}>Terms</a>
        </nav>
      </header>
      <main id="main"><Page /></main>
      <LegalFooter />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <World />
    <InfoSite />
  </StrictMode>,
);
