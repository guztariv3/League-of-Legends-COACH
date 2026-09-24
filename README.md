# Kairos Coach — League of Legends AI Coach

Aplicación web + desktop de análisis y coaching personal para League of Legends.
Hace el trabajo complejo por dentro y muestra solo lo que el jugador necesita.

**Estado:** Fases 1–5 completas sobre datos sintéticos o simulados. Ver `docs/05`–`docs/09`. Siguiente paso: validar con datos reales de Riot.

## Arranque rápido

```bash
pnpm install
pnpm dev:api     # API en :8787 (datos sintéticos + BD embebida si no hay .env)
pnpm dev:web     # http://localhost:5173
pnpm check       # typecheck + tests
pnpm test:e2e    # Playwright (web)
pnpm test:e2e:desktop   # ventana del Live Coach (modo demostración)
```

La configuración opcional está en [.env.example](.env.example). Sin `RIOT_API_KEY` todo funciona con datos sintéticos, claramente marcados en la UI.

## Estructura

```
apps/api      API (Hono + Drizzle, Postgres/PGlite)
apps/web      Web app (React + Vite)
apps/desktop  Live Coach (Tauri v2)
packages/     domain · synthetic · riot · knowledge · analysis · insights · ai · review · draft · live · ui
docs/         auditoría, investigación, arquitectura, roadmap, decisiones, fase 1
```

| Documento | Contenido |
|---|---|
| [docs/00-auditoria.md](docs/00-auditoria.md) | Estado del repo, entorno y herramientas |
| [docs/01-investigacion.md](docs/01-investigacion.md) | API de Riot, políticas y fuentes de datos (con nivel de verificación) |
| [docs/02-arquitectura.md](docs/02-arquitectura.md) | Arquitectura y stack |
| [docs/03-roadmap.md](docs/03-roadmap.md) | Fases |
| [docs/04-decisiones.md](docs/04-decisiones.md) | Decisiones, simplificaciones y riesgos |
| [docs/05-fase1.md](docs/05-fase1.md) | Fase 1: núcleo, limitaciones y quality gate |
| [docs/06-fase2.md](docs/06-fase2.md) | Fase 2: perfil, objetivos, memoria, búsqueda |
| [docs/07-fase3.md](docs/07-fase3.md) | Fase 3: revisión de partida, draft, scouting |
| [docs/08-fase4.md](docs/08-fase4.md) | Fase 4: Live Coach de escritorio, política, Modo seguro |
| [docs/09-fase5.md](docs/09-fase5.md) | Fase 5: evolución, jugador vs entorno, adaptabilidad, historial |

---

Kairos Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
