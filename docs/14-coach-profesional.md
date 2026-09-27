# Coach profesional: principios y plan

Requisito central del usuario (septiembre 2026): el Coach debe razonar como un coach profesional de League of Legends, no como una base de datos de builds ni como un selector del ítem con más victorias.

## Principios (se aplican a todo el motor)
- **Cada campeón es distinto.** El rol es una variable más; manda el kit (escalados, recurso, costes, enfriamientos, control, movilidad, alcance). Nada escrito a mano por campeón, ítem o runa (la prueba de nombres lo impide).
- **Contrajuego.** Primero qué quiere hacer el enemigo (ráfaga, peleas largas, curación, frontline, movilidad, control), luego cómo responde tu campeón, luego qué ítems, runas, habilidades y plan mejoran esa respuesta.
- **Tiempo y oro.** No basta con el mejor ítem: qué se puede comprar ahora, cuándo llegará cada ítem al ritmo real, y cuándo conviene volver a base.
- **Recursos.** Si el daño depende de lanzar habilidades con maná, la build debe sostenerlo aunque otra tenga más victorias.
- **Las estadísticas informan, no deciden.** Se usan como evidencia (con tamaño de muestra); el Coach puede rechazar una build popular que no encaje con el kit o con la partida.
- **Nada inventado.** Solo datos verificables del parche (Riot Data Dragon, Wiki vía Meraki, CommunityDragon, API de Riot). Si falta un dato, se dice; no se presenta una suposición como hecho.
- **Enseñar.** Cada recomendación dice por qué, cuándo y contra quién, en pocas palabras.

## Fuentes de estadísticas
Sitios como u.gg, Lolalytics, OP.GG o Mobalytics no tienen API pública y extraer sus datos de la web va contra sus condiciones: descartados. Aprobado por el usuario: agregar nosotros mismos partidas recientes Master+ del parche con la API oficial de Riot (match-v5 / league-v4), con la clave de producción, poco a poco y guardando solo resúmenes.

## Inteligencia de decisión (segundo requisito, septiembre 2026)
El Coach es un sistema de apoyo a la decisión, no una pantalla de estadísticas: interpreta la información (datos del parche, estadísticas, tu historial) y la convierte en una recomendación para **este** momento. Reglas:
- **Grado de certeza, sin falsa seguridad:** recomendación firme, opción preferida, alternativa viable o situación incierta. No hace falta mostrar un número, pero nunca se presenta una duda como hecho.
- **Alternativas solo cuando son reales:** "Recomendado: A · Alternativa: B" con la diferencia ("B si te quedas atrás o necesitas aguantar más"); si hay una sola opción razonable, no se inventa otra.
- **No forzar contraítems:** si el enemigo no cambia nada relevante para tu campeón, el Coach dice "sigue con tu build estándar".
- **Plan de partida dinámico:** el plan de la selección de campeón se reevalúa con el oro, niveles, ítems, objetivos, estado de línea y de equipo, picos de poder y amenazas (por delante: convertir en objetivos; por detrás: recuperar farm y experiencia sin peleas innecesarias).
- **Qué evitar:** avisos selectivos ("no pelees todavía", "no disputes sin prioridad", "no compres el ítem completo si una pieza rinde más"), solo cuando importan.
- **Memoria del jugador:** errores y virtudes recurrentes por campeón, rol, build, recursos, farm, objetivos, peleas y tempo de regreso a base, para personalizar lo siguiente.
- **Estilo de juego:** se adapta cuando hay varias opciones válidas ("la opción agresiva más segura"), nunca a costa de una decisión incorrecta.
- **Prioridades:** 1) supervivencia / amenaza crítica, 2) decisión que cambia la partida, 3) objetivo o momento clave, 4) ítem o habilidad, 5) plan a corto plazo, 6) build a largo plazo, 7) mejora del jugador. Una cosa importante cada vez; el resto espera.
- **Explicable:** qué, por qué, qué problema resuelve y por qué ahora, en corto; y un "Show reasoning" desplegable con la amenaza, la interacción, tus ítems, el oro, el momento, la alternativa considerada y el enfrentamiento.
- **Conocimiento separado del estado de la partida:** los datos del juego y del parche por un lado, lo que pasa en la partida por otro; el motor combina ambos.
- **Parche visible:** cada recomendación sabe si se basa en el parche actual, en el anterior o en datos históricos; nada caducado se presenta como actual, y un parche nuevo vuelve a validar lo afectado.

Ya existe la base: el contrato de decisión (`packages/coach/src/decision.ts`) lleva fundamento (hecho / observación / hipótesis), confianza, prioridad (crítica / importante / info), razones, evidencias con su fuente y tamaño de muestra, y alternativas; la tarjeta "Now" elige una sola decisión; la versión del parche va en cada build.

## Fases
1. **Tiempo y oro** (PR #42): compra inmediata con el oro que tienes (varias piezas si caben, la que más aporta), aviso de "con N de oro más compras X" con el tiempo que tarda a tu ritmo, cuándo llega cada ítem del plan (siguiente, luego, después) y tu oro por minuto (oro e ítems que tienes sobre los minutos de ingreso; es un mínimo porque no cuenta consumibles ni ventas).
2. **Plan dinámico y prioridades:** picos de poder propios y del rival, qué necesita tu equipo, plan que cambia con la partida (por delante / igualado / por detrás, objetivos que vienen), avisos de qué evitar y la jerarquía de prioridades en la tarjeta "Now".
3. **Certeza, alternativas y razonamiento:** niveles (firme / preferida / alternativa / incierta), "sigue con tu build estándar" cuando no hay motivo para cambiar, alternativas reales con su diferencia, y "Show reasoning" desplegable; orden de habilidades razonado desde el kit y el enfrentamiento.
4. **Estadísticas globales (Riot, Master+) con parche:** builds, orden y minuto de compra, runas, habilidades y % de victorias por campeón y enfrentamiento, marcadas como parche actual / anterior / histórico, solo como evidencia.
5. **Memoria y estilo del jugador:** patrones recurrentes (incluido el tempo de regreso a base) y estilo de juego, para personalizar sin contradecir lo correcto.
6. **Consejos de juego por fase:** línea, oleadas, intercambios, objetivos y peleas, con datos de la partida.

## Fase 1: detalles
- `planPurchases` (`packages/itemization/src/plan.ts`): árbol de receta con las piezas que ya tienes (cada una se usa una vez); coste real de cada pieza (precio menos sus subpiezas en tu inventario); la mejor combinación sin solaparse que cabe en tu oro, terminando el primer objetivo antes de gastar en el siguiente. "Merece esperar" solo si hasta 450 de oro más compra al menos 300 más de ítem.
- `liveCoach` devuelve `purchase` con los objetivos del motor en orden (primer ítem y siguientes); la decisión del ítem en la tarjeta "Now" lleva "Buy now". La app muestra el plan arriba de la pestaña Items.
- Pruebas con los datos reales del parche: sigue la receta, nunca gasta más de lo que tienes, prefiere piezas grandes, descuenta lo que tienes, termina y sigue con el siguiente, el aviso de esperar, el ritmo y el orden de llegada.
