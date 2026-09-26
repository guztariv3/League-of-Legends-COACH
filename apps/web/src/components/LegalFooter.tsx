import { CONTACT_URL, RIOT_NOTICE } from "../info/links";

/** Footer on every page: legal links and Riot's required notice. */
export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="Legal">
        <a href="/info/">About KOI Master</a>
        <a href="/info/privacy">Privacy</a>
        <a href="/info/terms">Terms</a>
        <a href={CONTACT_URL} rel="noopener noreferrer" target="_blank">Contact</a>
      </nav>
      <p>{RIOT_NOTICE}</p>
    </footer>
  );
}
