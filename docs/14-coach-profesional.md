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

## Fase 2: detalles
- **Situación de la partida** (`packages/coach/src/situation.ts`), recalculada con cada lectura del juego: fase (línea hasta que cae la primera torre, según el registro de eventos; después, equipo), tu posición frente a tu rival de línea (±1000 de oro en ítems o ±2 niveles) y la de tu equipo (±2000), jugadores vivos por equipo, tu vida y tu maná (el cliente del juego los da para el jugador activo), y tu próximo pico de poder (el siguiente ítem del plan de compra, con su hora a tu ritmo).
- **Plan del momento:** por detrás en línea → "farm y experiencia seguros, sin peleas innecesarias", con los números y tu próximo pico; por delante → "convierte la ventaja en objetivos, no en más peleas"; igualado → "farmea hasta tu próximo pico" (solo si lo hay); tras la primera torre, según el equipo (agruparse y tomar objetivos / evitar peleas igualadas y defender). Si nada cambia el plan, no dice nada.
- **Qué evitar (solo con un dato que lo justifique):** en inferioridad numérica de 2 o más (crítico); vida por debajo del 30 % (crítico; y lo que compras si vuelves a base); maná por debajo del 20 % en campeones de maná (no con energía); el rival de línea con más ítems terminados que tú (evitar intercambios largos hasta tu pico). Nada mientras estás muerto.
- **Prioridades en la tarjeta "Now":** a igual prioridad, avisos → ítem → habilidad → botas → plan → datos de la partida → revisión → foco de mejora; por eso sobrevivir va primero.
- **Tu equipo** (`packages/build/src/team.ts`, en selección de campeón): con al menos 3 aliados conocidos, si nadie más es frontline ("eres la frontline de tu equipo" o "tu equipo no tiene frontline: pelea después de su engage") y si el daño del equipo es casi todo físico o mágico (con el porcentaje y por qué importa la penetración).
- **App:** la pestaña Plan muestra "Right now" (plan y avisos, cada uno con "Show reasoning") encima del plan de la selección de campeón; la pestaña Draft muestra "Your team".
- Sin temporizadores ni cifras supuestas: solo lo que da el cliente del juego y los datos del parche.

## Fase 3: detalles
- **Build estándar** (`recommendBuild`, `adaptation`): el mismo motor con tu kit contra un enemigo neutro (daño mitad físico, mitad mágico, sin amenazas). Si coincide con la build de esta partida: "Nothing in the enemy team changes <campeón>'s standard core (…): continue with it." Si no: "<ítem> instead of the standard <ítem>: <el motivo de esta partida>" (la amenaza que responde con los campeones que la traen, la penetración contra quienes están hechos para aguantar, o el tipo de daño enemigo). Nunca se fuerza un contraítem.
- **Certeza** (`certainty`): por el margen entre el primer ítem y el siguiente mejor para ese hueco: ≥20 % "Strong recommendation", ≥8 % "Preferred option", menos "Close call". En la tarjeta "Now" (sin números): "Strong recommendation", "Preferred option" o "Uncertain: weigh the alternative".
- **Alternativa solo si es real** (`alternative`): únicamente en un "Close call", con lo que la diferencia ("B da más de las estadísticas que usa tu kit; A responde más a lo que hace el enemigo", con la amenaza concreta). La tarjeta "Now" solo muestra alternativa cuando la decisión es incierta.
- **Show reasoning:** en la tarjeta "Now" (resto de razones y datos) y en el primer ítem de la pestaña Draft; por defecto se ve solo lo esencial.
- **Orden de habilidades:** se pasa a la fase 4. Con solo los números por rango del kit, Ahri saldría Q → E → W cuando lo habitual es Q → W → E (la E se sube última por su control, no por su daño): sería presentar una suposición como hecho. Irá con las estadísticas de partidas Master+ del parche, y los números del kit como explicación. Mientras, sigue tu propio historial y, sin él, no dice nada de las habilidades básicas.
