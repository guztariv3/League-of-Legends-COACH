# Fase 3 · Análisis avanzado

Estado: **completa sobre datos sintéticos**. El acceso real a Riot sigue bloqueado en este entorno.

## Qué existe

| Área | Implementación | Dónde |
|---|---|---|
| Revisión de partida ("Replay", D-05) | Reconstrucción desde el timeline de match-v5: una foto de posiciones por minuto y los eventos con su hora exacta. Mapa SVG original (no es el minimapa de Riot) con controles de reproducir/pausa, ±1 min, "siguiente momento" y línea temporal con marcadores. Incluye mapa de impacto con tus kills y muertes. | `packages/review`, `/matches/:id/review` |
| Momentos clave | Clasificados como posible error, oportunidad, buena decisión o evento. Cada uno lleva tipo (hecho/hipótesis), confianza y cambio de oro del equipo en ±2 min. Los posibles errores y oportunidades son **siempre hipótesis** con confianza ≤ 0,7. Se destacan máximo 3 momentos, con como mucho 2 por categoría, para dar variedad. | idem |
| Límites visibles | Cada revisión explica lo que no puede saber: posiciones por minuto, que no distingue decisión de ejecución y que desconoce la información y las intenciones de cada jugador. | idem |
| Pre-partida / draft (D-03) | Solo con campeones. Primera línea según las etiquetas oficiales Tank/Fighter y perfil de daño **aproximado** según las valoraciones `info` de Data Dragon. Incluye tu historial con el campeón y contra el rival de línea, y tu "condición de victoria personal" (la métrica que más separa tus victorias de tus derrotas, solo si la diferencia está consolidada). Muestra máximo 3 puntos; el resto, bajo demanda. | `packages/draft`, "Antes de jugar" |
| Scouting (D-03) | Usa spectator-v5, que solo responde desde la pantalla de carga, así que nunca hay datos de otros jugadores durante la selección. Por rival: sus últimas 10 partidas con tamaño de muestra, partidas con el campeón actual, rol y KDA. Busca en todas tus cuentas vinculadas. Las partidas se cachean (son datos públicos inmutables) y los análisis de otros jugadores **no se guardan**. | `apps/api/src/scout.ts` |

## Decisiones y simplificaciones (sección 3)

| Cambio | Por qué | Qué se conserva |
|---|---|---|
| **Combat Engine y simulaciones pospuestos** | Nada en esta fase los necesita y Data Dragon no ofrece valores de habilidades fiables (D-06). Construirlos ahora sería infraestructura sin uso y con riesgo de fingir precisión. | Se retomarán cuando haya una fuente validada y una función que los consuma (builds). |
| **What-if no implementado** | Con posiciones por minuto no hay evidencia suficiente para comparar escenarios alternativos de forma honesta (sección 67). | La revisión permite explorar cualquier momento. |
| **Sin rango en el scouting** | El endpoint league-v4 por PUUID no está verificado y no se inventan endpoints. | Historial reciente con tamaño de muestra. |
| **Sin interpolación en el mapa** | Animar entre minutos sugeriría trayectorias que no conocemos. | Saltos de un minuto, explicados en la interfaz. |
| **Resolución de ±1 min, no ±10 s** | Es la resolución real de los datos de posición. | Los eventos se muestran con su segundo exacto. |
| **Área "Antes de jugar"** en lugar de "Partida" | "Partida" y "Partidas" juntas en el menú confundían. | Draft manual y partida en curso en una sola área. |

## Heurísticas del producto (a calibrar con datos reales)

- Aislamiento en una muerte: aliado más cercano a más de 4000 unidades en la última foto.
- Ventana de seguimiento para vincular una pelea con un objetivo: 90 s.
- Pelea ganada: 2 o más eliminaciones rivales en 30 s con menos bajas propias.
- Perfil de daño "mayoritario": ≥ 65 % (rival) o ≥ 75 % (propio) según las valoraciones.

## Versionado

- `REVIEW_VERSION = 1` y `DRAFT_VERSION = 1`.
- Conocimiento: `KNOWLEDGE_SCHEMA_VERSION = 2`. Si el parser extrae campos nuevos (las valoraciones `info`), un bundle guardado de la misma versión de juego se vuelve a ingerir; si esa reingesta falla, se conserva el bundle activo.
- Catálogo sintético: `0.0.2-synthetic`.

## Quality gate

- Typecheck en verde, 87 tests unitarios y de integración, y 6 E2E (escritorio y móvil).
- Revisión de código con la skill `code-review`: 2 bugs corregidos con tests. Los bundles guardados no se reingerían al añadir campos, y el scouting solo miraba la primera cuenta vinculada. Además se endureció un caso límite detectado al corregirlos: una reingesta fallida de la misma versión podía sustituir al bundle activo.
- Seguridad (manual): la revisión comprueba que la partida pertenece a una de tus cuentas; el draft valida su entrada (máximo 5 campeones por equipo); el scouting solo usa cuentas del usuario y no guarda datos derivados de terceros.
- Revisión visual: se renombró la sección "Partida" (confundible con "Partidas"), se corrigió "1 victorias" y se eliminó la animación entre minutos, que era engañosa.
- Se estabilizó un E2E con condición de carrera (esperar a que se aplique el filtro antes de abrir una partida).
