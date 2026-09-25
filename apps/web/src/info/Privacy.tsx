import { CONTACT_URL } from "./links";

const UPDATED = "25 de septiembre de 2026";

/** Plain description of what KOI Master stores, why, where and for how long. Keep it in sync with the code. */
export function Privacy() {
  return (
    <article className="card stack legal">
      <h1 className="page-title">Política de privacidad</h1>
      <p className="tile-note">Última actualización: {UPDATED}</p>
      <p>
        KOI Master es un proyecto independiente. Esta página explica qué datos usa, para qué y cómo borrarlos. Para cualquier pregunta o para ejercer tus derechos,
        escríbenos en <a href={CONTACT_URL} rel="noopener noreferrer" target="_blank">el apartado de contacto del proyecto</a>.
      </p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li><strong>Tu cuenta de KOI Master:</strong> un nombre visible y tus preferencias (nivel de detalle, idioma, qué puede recordar el coach).</li>
        <li><strong>Tus cuentas de Riot vinculadas:</strong> Riot ID, región y el identificador de jugador de Riot (PUUID).</li>
        <li><strong>Datos de partidas</strong> que ofrece la API oficial de Riot Games: tus partidas y, dentro de ellas, las estadísticas públicas de los demás jugadores tal como las publica Riot.</li>
        <li><strong>Lo que genera el coach:</strong> los análisis de tus partidas, tus objetivos, lo que el coach recuerda (puedes desactivarlo por categorías) y el historial de recomendaciones.</li>
        <li><strong>La app de escritorio conectada:</strong> su nombre, cuándo se conectó y cuándo se usó por última vez. Del código y del token solo guardamos una huella (hash), nunca el valor.</li>
        <li><strong>Una cookie de sesión</strong> para mantenerte conectado (dura 30 días). No usamos cookies de publicidad ni de analítica, ni rastreadores de terceros.</li>
      </ul>

      <h2>Para qué</h2>
      <p>Solo para darte el servicio: analizar tus partidas, enseñarte a tus rivales en la pantalla de carga y recordar tus preferencias. No vendemos ni cedemos datos y no mostramos publicidad.</p>

      <h2>Quién más interviene</h2>
      <ul>
        <li><strong>Riot Games:</strong> de su API salen los datos de partidas. Las imágenes del juego (campeones, objetos, runas) las descarga tu navegador directamente de Data Dragon, el servicio de Riot, que por tanto recibe tu dirección IP.</li>
        <li><strong>Render</strong> aloja la web y la base de datos en Fráncfort (Unión Europea).</li>
        <li><strong>Anthropic</strong> (si las explicaciones con IA están activadas): recibe solo el texto de una conclusión ya calculada y sus cifras, para redactarla mejor. No recibe tu Riot ID, tu nombre ni tus partidas completas.</li>
      </ul>

      <h2>Cuánto tiempo</h2>
      <ul>
        <li>Tus datos se guardan mientras tengas la cuenta.</li>
        <li><strong>Ajustes → Borrar todos mis datos</strong> elimina al momento tu cuenta, tus cuentas de Riot vinculadas, tus análisis personales, objetivos, memoria, preferencias, apps conectadas y sesiones.</li>
        <li>Al desvincular una cuenta de Riot se borra su historial en KOI Master.</li>
        <li>Los datos de partidas que ya no usa ninguna cuenta vinculada (por ejemplo, las partidas de rivales consultadas en la pantalla de carga) se borran automáticamente a los 30 días.</li>
        <li>Los códigos de conexión sin usar y las sesiones caducadas se borran solos.</li>
      </ul>

      <h2>La app de escritorio</h2>
      <p>
        Durante la partida, la app solo lee los datos que el propio juego publica en tu ordenador (la Live Client Data API) y no los envía a ningún sitio.
        Si la conectas a la web, pide la lista de tus rivales a tu cuenta de KOI Master con su token; puedes desconectarla desde Ajustes cuando quieras.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes acceder a tus datos, corregirlos, borrarlos, limitar su uso u oponerte a él, y pedir una copia. La mayoría lo puedes hacer tú desde Ajustes; para lo demás, usa el contacto.
        Si vives en la Unión Europea, también puedes reclamar ante la autoridad de protección de datos de tu país.
      </p>
    </article>
  );
}
