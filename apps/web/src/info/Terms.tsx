import { CONTACT_URL, RIOT_NOTICE } from "./links";

const UPDATED = "September 26, 2026";

export function Terms() {
  return (
    <article className="card stack legal">
      <h1 className="page-title">Terms of use</h1>
      <p className="tile-note">Last updated: {UPDATED}</p>

      <h2>What it is</h2>
      <p>
        KOI Master is a free, independent League of Legends coach in prototype stage. It analyzes data from your games and informs you;
        decisions in and out of the game are always yours.
      </p>

      <h2>Relationship with Riot Games</h2>
      <p>{RIOT_NOTICE}</p>
      <p>
        When you use KOI Master you remain bound by Riot Games' terms of service. KOI Master only uses Riot's official API and the data the game publishes on your computer;
        it does not modify the game, read its memory, automate actions or interfere with Vanguard.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Use it to improve your own play.</li>
        <li>Do not use it to harass other players or to collect data in bulk.</li>
        <li>Do not try to bypass its limits, access other people's accounts or disrupt how it works.</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        It is a prototype: it may fail, change or stop being available. The analysis is based on public data and statistics; it can be wrong, especially with few games,
        which is why we always show the sample size. To the extent permitted by law, KOI Master is provided "as is", without warranty.
      </p>

      <h2>Your account</h2>
      <p>You can delete your account and your data at any time from Settings. We may suspend accounts that break these terms.</p>

      <h2>Changes and contact</h2>
      <p>
        If these terms change, the date above will be updated. For any question, use <a href={CONTACT_URL} rel="noopener noreferrer" target="_blank">the project's contact page</a>.
      </p>
    </article>
  );
}
