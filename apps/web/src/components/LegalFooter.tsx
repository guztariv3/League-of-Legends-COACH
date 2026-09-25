import { CONTACT_URL, RIOT_NOTICE_EN, RIOT_NOTICE_ES } from "../info/links";

/** Footer on every page: legal links and Riot's required notice. */
export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="Información legal">
        <a href="/info/">Qué es KOI Master</a>
        <a href="/info/privacidad">Privacidad</a>
        <a href="/info/terminos">Términos</a>
        <a href={CONTACT_URL} rel="noopener noreferrer" target="_blank">Contacto</a>
      </nav>
      <p>{RIOT_NOTICE_ES}</p>
      <p lang="en">{RIOT_NOTICE_EN}</p>
    </footer>
  );
}
