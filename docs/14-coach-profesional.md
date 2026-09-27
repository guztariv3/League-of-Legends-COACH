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

## Fases
1. **Tiempo y oro** (este PR): compra inmediata con el oro que tienes (varias piezas si caben, la que más aporta), aviso de "con N de oro más compras X" con el tiempo que tarda a tu ritmo, cuándo llega cada ítem del plan (siguiente, luego, después) y tu oro por minuto (oro e ítems que tienes sobre los minutos de ingreso; es un mínimo porque no cuenta consumibles ni ventas).
2. **Picos de poder y tu equipo:** picos propios y del rival; qué necesita tu equipo además de contra quién juegas; orden de habilidades razonado desde el kit y el enfrentamiento.
3. **Explicaciones que enseñan:** conectar cada porqué con el momento de la partida.
4. **Estadísticas globales (Riot, Master+):** builds, orden y minuto de compra, runas, orden de habilidades y % de victorias por campeón y enfrentamiento, como evidencia.
5. **Consejos de juego por fase:** línea, oleadas, objetivos y peleas, con datos de la partida.

## Fase 1: detalles
- `planPurchases` (`packages/itemization/src/plan.ts`): árbol de receta con las piezas que ya tienes (cada una se usa una vez); coste real de cada pieza (precio menos sus subpiezas en tu inventario); la mejor combinación sin solaparse que cabe en tu oro, terminando el primer objetivo antes de gastar en el siguiente. "Merece esperar" solo si hasta 450 de oro más compra al menos 300 más de ítem.
- `liveCoach` devuelve `purchase` con los objetivos del motor en orden (primer ítem y siguientes); la decisión del ítem en la tarjeta "Now" lleva "Buy now". La app muestra el plan arriba de la pestaña Items.
- Pruebas con los datos reales del parche: sigue la receta, nunca gasta más de lo que tienes, prefiere piezas grandes, descuenta lo que tienes, termina y sigue con el siguiente, el aviso de esperar, el ritmo y el orden de llegada.
