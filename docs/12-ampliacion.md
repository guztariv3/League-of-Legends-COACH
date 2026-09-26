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
