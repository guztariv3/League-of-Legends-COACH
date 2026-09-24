# Roadmap mínimo viable

No se avanza a una fase si la anterior no pasa su quality gate (tests, revisión UX, rendimiento, seguridad y docs).

## Fase 0 — Auditoría + investigación + arquitectura ✅ (este commit)

## Fase 1 — Núcleo funcional (con datos sintéticos primero)
1. Monorepo, CI local (lint, typecheck, test) y hook de sesión.
2. `synthetic/`: generador de partidas y timelines versionados (normales, extremos, datos faltantes, errores). Es la base de todos los tests.
3. `riot/`: cliente con routing, rate limiter por región y caché, probado contra un mock. Se usa la API real en cuanto haya red y key.
4. `knowledge/`: ingestión de Data Dragon por versión, con validación y rollback. Con fixture local mientras no haya red.
5. Auth: adaptador (D-01) + multi-cuenta y multi-región.
6. Sync: últimas 50 partidas + sync incremental al abrir.
7. UI: design system, Dashboard (3–5 bloques decididos por el sistema), Match Center con filtros y detalle básico.
8. Análisis básico por modo (SR/ARAM) + Coach inicial (insights deterministas + explicación LLM opcional).

## Fase 2 — Personalización
Perfil del jugador (dimensiones con evidencia), patrones entre partidas, objetivos (1–3, opt-in), Coach contextual en cualquier pantalla, memoria editable, búsqueda.

## Fase 3 — Análisis avanzado
Match Review basado en timeline (mapa por minuto, marcadores, clasificación de decisiones), análisis de draft (solo campeones), scouting desde la pantalla de carga, análisis de composición. Combat Engine limitado a cálculos validados (D-06).

## Fase 4 — Live (desktop)
Tauri, lector de Live Client Data, pipeline local, Safe Mode, Focus Mode, controles (ocultar, pausar, silenciar, intensidad) y updater con rollback. Requiere confirmar la política de Riot vigente en ese momento.

## Fase 5 — Inteligencia avanzada
Análisis longitudinal con tests estadísticos, puntos de inflexión, adaptabilidad y predicciones como hipótesis (solo post-game y pre-game), y What-if post-game donde haya evidencia suficiente.
