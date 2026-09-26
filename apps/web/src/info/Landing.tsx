import { CoachAvatar } from "@coach/ui";
import { DOWNLOAD_URL } from "./links";

const features = [
  {
    title: "Your games, explained",
    text: "It analyzes your real Riot history: where you gain and lose gold, how you change on each champion and which patterns repeat. Always with the sample size, never with made-up data.",
  },
  {
    title: "Your opponents, at the loading screen",
    text: "Riot ID, rank, win rate and top three champions of every opponent, on the website or in the desktop app. Not earlier: Riot keeps them hidden in the lobby and in champion select.",
  },
  {
    title: "What to buy, based on the game",
    text: "In game, the app suggests your next item based on what the enemies build, who is ahead and how you are doing, explains why, and shows how to buy it with the gold you have.",
  },
  {
    title: "Live Coach, no orders",
    text: "A side window that tells you what matters (your power spikes, your opponent's, your CS goal) and stays quiet otherwise. It informs; the decisions are yours. It works in every mode.",
  },
  {
    title: "Honest and private",
    text: "It never makes data up: every conclusion says how many games are behind it, and when it does not know, it says so. Your data is yours alone and you can delete it at any time.",
  },
  {
    title: "Respects the game",
    text: "It only reads the data the game itself publishes. It does not read memory, inject anything, draw inside the game or touch Vanguard.",
  },
];

export function Landing() {
  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="info-hero">
        <span className="info-hero-avatar"><CoachAvatar /></span>
        <div>
          <h1 className="page-title">Your personal League of Legends coach</h1>
          <p className="page-sub">
            KOI Master studies your games, shows you who you are up against and keeps you company in game. It tells you what is happening and why; never what you have to do.
          </p>
        </div>
      </section>

      <div className="grid info-features">
        {features.map((f) => (
          <section key={f.title} className="card">
            <h2>{f.title}</h2>
            <p style={{ margin: 0 }}>{f.text}</p>
          </section>
        ))}
      </div>

      <section className="card stack" id="download" aria-labelledby="dl-h">
        <h2 id="dl-h">Download the desktop app</h2>
        <p style={{ margin: 0 }}>
          For Windows. It opens as a side window next to the game. It works without an account: next item suggestion based on the enemies and the game, how to buy it, the scoreboard with everyone's items and Live Coach notices. With a website account you also get your opponents at the loading screen.
        </p>
        <div className="row">
          <a className="btn btn-primary" href={DOWNLOAD_URL} rel="noopener noreferrer">Download for Windows</a>
          <span className="tile-note">Opens the latest release on GitHub: download the <code>.exe</code> file.</span>
        </div>
        <details className="layer">
          <summary>Windows says "Windows protected your PC"</summary>
          <p>
            The app does not have a Windows code-signing certificate yet (it costs money), so SmartScreen does not recognize it. Click <strong>More info → Run anyway</strong>.
          </p>
        </details>
      </section>

      <section className="card stack" aria-labelledby="state-h">
        <h2 id="state-h">Project status</h2>
        <p style={{ margin: 0 }}>
          KOI Master is an independent project in prototype stage. The website is in closed testing while Riot Games reviews the application: once approved, you will be able to sign in with your Riot account.
        </p>
      </section>
    </div>
  );
}
