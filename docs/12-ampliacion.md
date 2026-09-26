# Ampliación: amplitud tipo Mobalytics + Coach como capa de decisión

Directiva del usuario del 2026-09-26 (D-10). La auditoría completa (25 secciones, con el mapa de Mobalytics sacado de 18 capturas de la app con sesión iniciada) se entregó como página privada; aquí queda lo que guía el código.

## Principios
- **Datos → inteligencia → presentación.** La interfaz no decide nada; los motores devuelven decisiones con razones, evidencia y confianza (`packages/coach`, F1c).
- **El Coach decide según la partida, no por popularidad.** El win rate solo es evidencia de apoyo y se muestra aparte (D-14).
- **Nunca inventar datos.** Una sección sin fuente lo dice; no se rellena con texto de IA (D-15).
- **Riot y Vanguard:** solo APIs oficiales (Live Client Data, LCU en solo lectura, Riot API). Nada de memoria, inyección, drivers ni archivos del juego. Overlay opcional y apagado (D-11). Estrategia in-game dentro de D-02 (D-12).

## Roadmap
| Fase | Contenido | Depende de |
|---|---|---|
| F1 Fundamentos | Análisis v4 (habilidades, compras, runas y fragmentos, CSD@15, cuota de oro, DPM, daño recibido, muertes en solitario); fotos de rango y LP; `packages/coach`; habilidades y eventos en vivo; tarjeta del Coach | — |
| F2 In-game | Build por fases, asesor de habilidades, asesor de estrategia (D-12), tarjeta "Now", diferencia de oro por valor de ítems, overlay opcional (D-11) | F1 |
| F3 Pre-game | COACH GAME PLAN (web y app); selección de campeones por la LCU (D-13) | F1; registro LCU |
| F5 Post-game | Coach Review de 8 apartados, decisión de build y de habilidades, logros por hechos, highlights por timeline | F1 |
| F4 Navegación y campeones | Barra nueva (web y teléfono), base de 173 campeones, página de campeón con pestañas, cuadrícula de habilidades 1–18 | F1; Meraki (D-15) |
| F6 Mejora | Áreas de desarrollo, retos diarios y semanales ("3 de las próximas 5"), gráfica de LP, Matchup Pool, Champion Pool, calendario de actividad | F1 |
| F7 Estadísticas globales | Recolector NA, tier list, counters, builds y habilidades populares, buscar jugadores | Clave de producción |
| F8 Conocimiento | Guías, combos, fortalezas con fuente | D-15 |
| F9 Apertura | RSO + clave de producción | Riot |

## F1a — análisis v4 (hecho)
`packages/domain/src/timeline.ts`: `skillOrderOf` (descarta los `SKILL_LEVEL_UP` duplicados que Riot envía desde el parche 15.17 y los `EVOLVE`), `purchasesOf` (quita las compras deshechas con `ITEM_UNDO`), `soloDeathsOf`, `csDiffAt`. El normalizador guarda las runas completas, los fragmentos y el daño recibido. `ANALYSIS_VERSION = 4`: el servidor reanaliza las partidas guardadas al arrancar, sin llamar a Riot.

## F1b — rango y LP (hecho)
Tabla `rank_snapshots` (migración 0005): tras cada sincronización se guarda el rango de Solo/Duo y Flex de league-v4, solo si algo cambió. `GET /api/rank` devuelve el rango actual y el historial por cola; `lpChange` solo aparece cuando entre dos fotos hubo exactamente una partida (si no, no se sabe cuánto LP dio cada una). `ladderPoints` pone todas las divisiones en una escala (100 por división; Master+ comparten base) para medir cambios con ascensos y descensos. Un fallo de league-v4 nunca rompe la sincronización. El historial empieza el día en que se despliega: Riot no guarda el pasado. Las filas se borran con la cuenta.

## F1c — capa de decisiones del Coach (hecho)
`packages/coach`: `CoachDecision` (qué, por qué —nunca vacío—, evidencia con su fuente: `this_game`, `your_games`, `game_data` o `global_stats`, confianza, base fact/observation/hypothesis y alternativas). `rankDecisions`, `pickNow` (la tarjeta "Now" no parpadea entre opciones parecidas) e `isAdjustment` (misma clase de recomendación que cambia → "Coach adjustment"). Adaptadores sin juicio propio: `fromItemSuggestions` y `fromInsight`.

## F1d — datos en vivo (hecho)
- Rangos de tus habilidades (`activePlayer.abilities`, solo del jugador activo) y puntos sin gastar (`skillPoints`), base del asesor de habilidades.
- `goldDifference`: diferencia por enfrentamiento y total por equipo **por valor de ítems** (el juego no da el oro de los demás; es lo mismo que muestra la tabla TAB). Por posición en la Grieta; por orden donde no hay líneas.
- `objectives`: dragones (con tipo), heraldos, barones, torres e inhibidores por equipo a partir del feed de eventos. Las estructuras se atribuyen por su dueño en el nombre (T1 = ORDER, T2 = CHAOS).
- La tarjeta del Coach en la interfaz se hace en F2, donde se usa por primera vez. Todo aviso nuevo pasa por el `PolicyEngine` existente, que ya bloquea el lenguaje de órdenes (D-02, D-12).

## F2a — Coach en vivo (hecho)
- `suggestStarter` (itemization): ítem inicial por rol y matchup — Anillo de Doran para daño mágico, Espada de Doran para físico, Escudo de Doran para un melee contra un rival a distancia (con los alcances de Data Dragon `stats.attackrange`), mascota de jungla y objeto de support. Solo en la Grieta; un objeto que no exista en el parche no se sugiere.
- `adviseSkill` (coach): la R en cuanto se abre un rango (regla del juego, "fact"); las básicas siguen **tu propio orden** con ese campeón (mínimo 3 partidas con timeline; "observation"). Sin historial no sugiere básicas: no hay orden universal. Campeones con reglas propias (Udyr…) quedan fuera. `/api/desktop/build` devuelve ahora `skillOrders`.
- `strategyFacts` (coach, D-12): diferencia de oro por ítems del equipo (≥2000) y de tu matchup (≥1000) y resumen de dragones; hechos, nunca órdenes (probado contra el `PolicyEngine`).
- `liveCoach`: une todo; la app solo lo pinta. Ventana: tarjeta **Now** (azul hextech, `CoachCard` de `packages/ui`) sobre las pestañas Items · Skills · Gold · Enemies · Team. "Coach adjustment" solo cuando la recomendación de ítem cambia sin que hayas comprado la anterior.
