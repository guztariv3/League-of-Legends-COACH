import { CONTACT_URL, RIOT_NOTICE_ES } from "./links";

const UPDATED = "25 de septiembre de 2026";

export function Terms() {
  return (
    <article className="card stack legal">
      <h1 className="page-title">Términos de uso</h1>
      <p className="tile-note">Última actualización: {UPDATED}</p>

      <h2>Qué es</h2>
      <p>
        KOI Master es un coach de League of Legends gratuito e independiente, en fase de prototipo. Analiza datos de tus partidas y te informa;
        las decisiones dentro y fuera del juego son siempre tuyas.
      </p>

      <h2>Relación con Riot Games</h2>
      <p>{RIOT_NOTICE_ES}</p>
      <p>
        Al usar KOI Master sigues sujeto a los términos de servicio de Riot Games. KOI Master solo usa la API oficial de Riot y los datos que el juego publica en tu ordenador;
        no modifica el juego, no lee su memoria, no automatiza acciones y no interfiere con Vanguard.
      </p>

      <h2>Uso aceptable</h2>
      <ul>
        <li>Úsalo para mejorar tu propio juego.</li>
        <li>No lo uses para acosar a otros jugadores ni para recopilar datos de forma masiva.</li>
        <li>No intentes saltarte sus límites, acceder a cuentas ajenas ni afectar a su funcionamiento.</li>
      </ul>

      <h2>Sin garantías</h2>
      <p>
        Es un prototipo: puede fallar, cambiar o dejar de estar disponible. Los análisis se basan en datos públicos y en estadística; pueden equivocarse, sobre todo con pocas partidas,
        y por eso siempre indicamos el tamaño de la muestra. En la medida que permita la ley, KOI Master se ofrece "tal cual", sin garantías.
      </p>

      <h2>Tu cuenta</h2>
      <p>Puedes borrar tu cuenta y tus datos cuando quieras desde Ajustes. Podemos suspender cuentas que incumplan estos términos.</p>

      <h2>Cambios y contacto</h2>
      <p>
        Si cambian estos términos, se actualizará la fecha de arriba. Para cualquier duda, usa <a href={CONTACT_URL} rel="noopener noreferrer" target="_blank">el contacto del proyecto</a>.
      </p>
    </article>
  );
}
