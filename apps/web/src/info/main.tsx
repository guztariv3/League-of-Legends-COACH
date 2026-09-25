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
  "": { title: "KOI Master · Coach personal de League of Legends", Page: Landing },
  privacidad: { title: "Privacidad · KOI Master", Page: Privacy },
  terminos: { title: "Términos · KOI Master", Page: Terms },
};

function InfoSite() {
  const slug = location.pathname.replace(/^\/info\/?/, "").replace(/\/$/, "");
  const { title, Page } = pages[slug] ?? pages[""]!;
  document.title = title;
  return (
    <div className="shell">
      <header className="topbar">
        <a href="/info/" className="brand" aria-label="KOI Master, presentación">
          <span style={{ width: 28, height: 28, display: "inline-flex" }}><CoachAvatar quiet /></span>
          KOI MASTER
        </a>
        <nav className="nav" aria-label="Principal">
          <a href="/info/" aria-current={slug === "" ? "page" : undefined}>Inicio</a>
          <a href="/info/#descargar">Descargar</a>
          <a href="/info/privacidad" aria-current={slug === "privacidad" ? "page" : undefined}>Privacidad</a>
          <a href="/info/terminos" aria-current={slug === "terminos" ? "page" : undefined}>Términos</a>
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
