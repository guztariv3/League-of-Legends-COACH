# Decisiones, simplificaciones y riesgos

Estado: **P** = propuesta pendiente de aprobación · **A** = aceptada (D-01 a D-06 aprobadas el 2026-09-24).

## Decisiones que requieren aprobación (sección 118)

| ID | Decisión | Por qué | Estado |
|---|---|---|---|
| D-01 | **Autenticación en dos etapas.** Mientras no haya Production key + RSO: login de desarrollo (cuentas sintéticas) y vinculación de cuenta por Riot ID solo con datos públicos, marcada como "no verificada". El adaptador RSO (OAuth) se implementa detrás de la misma interfaz y se activa al aprobarse. | RSO solo está disponible para apps de producción aprobadas, y la aprobación exige un prototipo funcional. | A |
| D-02 | **Live Coach reducido a lo permitido por la política:** informa y ofrece opciones, nunca ordena. Sin ultis enemigas, sin cooldowns de summoners enemigos y sin predicciones de intención enemiga en vivo. Las hipótesis estratégicas y las predicciones quedan en pre-game y post-game. | La política de Riot prohíbe notificaciones que dictan acciones según el estado de la partida y el tracking de ultis. | A |
| D-03 | **Scouting enemigo solo desde la pantalla de carga.** El draft analiza campeones, no jugadores. | Anonimato de champ select y prohibición de facilitar el dodge. | A |
| D-04 | **Stack:** TypeScript + pnpm, React/Vite, Hono, Postgres/Drizzle, Tauri v2 (pg-boss pospuesto; ver `05-fase1.md`). | Ver `02-arquitectura.md`. | A |
| D-05 | **"Replay" = Match Review sobre el timeline de match-v5** (resolución de ~1 min, eventos exactos). No es vídeo ni movimiento continuo, y se indica así en la UI. | No existe API de replays ni parser oficial de .rofl. | A |
| D-06 | **Combat/teamfight simulation pospuesto y limitado.** Solo cálculos con datos validados (stats base, resistencias, % de mitigación). Sin simulaciones de combos ni teamfights con números hasta tener una fuente fiable de valores de habilidades. | Data Dragon tiene valores de habilidades incompletos y CommunityDragon no es oficial. Regla: no fingir precisión. | A |
| D-07 | **Modelo LLM por defecto y coste.** Propuesta: `claude-opus-5` para análisis post-game y chat, y opcionalmente un modelo más barato (`claude-haiku-4-5`) para explicaciones cortas. Configurable. | Afecta directamente al coste. | P |
| D-08 | **Hosting.** Pendiente de elegir proveedor (contenedor + Postgres gestionado). | Coste. Se decidirá antes del primer despliegue. | P |

## Simplificaciones aplicadas (sección 3)

| Cambio | Por qué | Valor que se conserva |
|---|---|---|
| Decision, Confidence, Recommendation, Threat/Opportunity y Notifications se fusionan en una única pipeline `insights/`. | Cinco motores con la misma entrada y salida duplican lógica y umbrales. | Priorización, confianza centralizada, anti-spam y la decisión de no intervenir. |
| Player DNA, Player Profile, Knowledge Profile y Evolution Timeline se fusionan en un solo modelo `analysis/profile`. | Son vistas del mismo conjunto de evidencias. | Todas las dimensiones del jugador. La UI muestra solo conclusiones. |
| Pipeline de parche basado en diffs de Data Dragon, no en parsear patch notes. | No hay una API oficial de patch notes y parsear texto es poco fiable. | Conocimiento versionado, detección de impacto y rollback. |
| Sin Redis ni colas externas: pg-boss sobre Postgres. | Una sola pieza de infraestructura. | Jobs de sync con reintentos. |
| Impact Map a resolución de minuto dentro de Match Review. | Son los únicos datos de posición legítimos. | Zonas, objetivos y momentos clave. |

## Riesgos abiertos

1. **Dependencia de Riot:** la Production key y RSO pueden denegarse o tardar. La política cambia con frecuencia.
2. **Red del entorno:** los dominios de Riot están bloqueados en este entorno cloud. Sin acceso no hay pruebas reales.
3. **Calidad de datos de habilidades** (ver D-06).
4. **Coste del LLM** a escala: se mitiga con caching, lógica determinista primero y explicaciones generadas solo bajo demanda.
5. **Uso de la LCU** en el desktop: requiere registrar su uso ante Riot y limitarse a los endpoints permitidos.
