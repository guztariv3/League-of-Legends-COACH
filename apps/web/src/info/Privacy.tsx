import { CONTACT_URL } from "./links";

const UPDATED = "September 26, 2026";

/** Plain description of what KOI Master stores, why, where and for how long. Keep it in sync with the code. */
export function Privacy() {
  return (
    <article className="card stack legal">
      <h1 className="page-title">Privacy policy</h1>
      <p className="tile-note">Last updated: {UPDATED}</p>
      <p>
        KOI Master is an independent project. This page explains what data it uses, what for, and how to delete it. For any question, or to exercise your rights,
        write to us through <a href={CONTACT_URL} rel="noopener noreferrer" target="_blank">the project's contact page</a>.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your KOI Master account:</strong> a display name and your preferences (level of detail, what the coach may remember).</li>
        <li><strong>Your linked Riot accounts:</strong> Riot ID, region and Riot's player identifier (PUUID), plus your ranked tier and LP each time they change (Riot keeps no history, so this is what draws your LP graph).</li>
        <li><strong>Match data</strong> provided by Riot Games' official API: your games and, within them, the other players' public statistics as Riot publishes them.</li>
        <li><strong>What the coach produces:</strong> the analysis of your games, your goals and challenges, your rank snapshots, what the coach remembers (you can turn this off by category) and the recommendation history.</li>
        <li><strong>The connected desktop app:</strong> its name, when it was connected and when it was last used. For the code and the token we only store a fingerprint (hash), never the value.</li>
        <li><strong>A session cookie</strong> to keep you signed in (lasts 30 days). We use no advertising or analytics cookies, and no third-party trackers.</li>
      </ul>

      <h2>What for</h2>
      <p>Only to provide the service: analyze your games, show you your opponents at the loading screen and remember your preferences. We do not sell or share data, and we show no ads.</p>

      <h2>Who else is involved</h2>
      <ul>
        <li><strong>Riot Games:</strong> match data comes from its API. Game images (champions, items, runes) are downloaded by your browser directly from Data Dragon, Riot's service, which therefore receives your IP address.</li>
        <li><strong>Render</strong> hosts the website and the database in Frankfurt (European Union).</li>
        <li><strong>Anthropic</strong> (if AI explanations are turned on): receives only the text of an already computed conclusion and its figures, to phrase it better. It does not receive your Riot ID, your name or your full games.</li>
      </ul>

      <h2>How long</h2>
      <ul>
        <li>Your data is kept while you have an account.</li>
        <li><strong>Settings → Delete all my data</strong> immediately deletes your account, your linked Riot accounts, your personal analysis, goals, challenges, rank snapshots, memory, preferences, connected apps and sessions.</li>
        <li>Unlinking a Riot account deletes its history in KOI Master.</li>
        <li>Match data no linked account uses any more (for example, opponents' games looked up at the loading screen) is deleted automatically after 30 days.</li>
        <li>Unused connection codes and expired sessions are deleted automatically.</li>
      </ul>

      <h2>The desktop app</h2>
      <p>
        During a game, the app only reads the data the game itself publishes on your computer (the Live Client Data API) and does not send it anywhere.
        If you connect it to the website, it asks your KOI Master account for your opponents' list with its token; you can disconnect it from Settings at any time.
      </p>

      <h2>Your rights</h2>
      <p>
        You can access, correct and delete your data, restrict or object to its use, and ask for a copy. You can do most of it yourself from Settings; for anything else, use the contact page.
        If you live in the European Union, you can also complain to your country's data protection authority.
      </p>
    </article>
  );
}
