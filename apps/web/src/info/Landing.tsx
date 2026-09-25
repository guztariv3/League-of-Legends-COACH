import { CoachAvatar } from "@coach/ui";
import { DOWNLOAD_URL } from "./links";

const features = [
  {
    title: "Tus partidas, explicadas",
    text: "Analiza tu historial real de Riot: dónde ganas y pierdes oro, cómo cambias con cada campeón y qué patrones se repiten. Siempre con el tamaño de la muestra, sin inventar datos.",
  },
  {
    title: "Tus rivales, en la pantalla de carga",
    text: "Riot ID, rango, porcentaje de victorias y sus tres mejores campeones de cada rival, en la web o en la app de escritorio. Antes no se puede: Riot los mantiene ocultos en el lobby y en la selección.",
  },
  {
    title: "Live Coach, sin órdenes",
    text: "Una ventana lateral que te avisa de lo importante (tus picos de poder, los de tu rival, tu objetivo de CS) y calla el resto. Informa; las decisiones son tuyas. Funciona en todos los modos.",
  },
  {
    title: "Respeta el juego",
    text: "Solo lee los datos que el propio juego publica. No lee memoria, no inyecta nada, no dibuja dentro del juego ni toca Vanguard.",
  },
];

export function Landing() {
  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="info-hero">
        <span className="info-hero-avatar"><CoachAvatar /></span>
        <div>
          <h1 className="page-title">Tu coach personal de League of Legends</h1>
          <p className="page-sub">
            KOI Master estudia tus partidas, te enseña contra quién juegas y te acompaña en partida. Te dice qué pasa y por qué; nunca qué tienes que hacer.
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

      <section className="card stack" id="descargar" aria-labelledby="dl-h">
        <h2 id="dl-h">Descargar la app de escritorio</h2>
        <p style={{ margin: 0 }}>
          Para Windows. Se abre como una ventana lateral junto al juego. El Live Coach funciona sin cuenta; para ver a tus rivales, conéctala a la web con un código (Ajustes → App de escritorio).
        </p>
        <div className="row">
          <a className="btn btn-primary" href={DOWNLOAD_URL} rel="noopener noreferrer">Descargar para Windows</a>
          <span className="tile-note">Abre la última versión publicada en GitHub: descarga el archivo <code>.exe</code>.</span>
        </div>
        <details className="layer">
          <summary>Windows dice "Windows protegió su PC"</summary>
          <p>
            La app aún no tiene un certificado de firma de Windows (es de pago), así que SmartScreen no la reconoce. Pulsa <strong>Más información → Ejecutar de todas formas</strong>.
            Las actualizaciones sí van firmadas y la app comprueba la firma antes de instalarlas.
          </p>
        </details>
      </section>

      <section className="card stack" aria-labelledby="state-h">
        <h2 id="state-h">Estado del proyecto</h2>
        <p style={{ margin: 0 }}>
          KOI Master es un proyecto independiente en fase de prototipo. La web está en pruebas cerradas mientras Riot Games revisa la aplicación: cuando la apruebe, podrás entrar con tu cuenta de Riot.
        </p>
      </section>
    </div>
  );
}
