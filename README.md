# Kairos Coach — League of Legends AI Coach

Aplicación web + desktop de análisis y coaching personal para League of Legends.
Hace el trabajo complejo por dentro y muestra solo lo que el jugador necesita.

**Estado:** Fase 1 completa sobre datos sintéticos. Ver [docs/05-fase1.md](docs/05-fase1.md).

## Arranque rápido

```bash
pnpm install
pnpm dev:api     # API en :8787 (datos sintéticos + BD embebida si no hay .env)
pnpm dev:web     # http://localhost:5173
pnpm check       # typecheck + tests
pnpm test:e2e    # Playwright
```

La configuración opcional está en [.env.example](.env.example). Sin `RIOT_API_KEY` todo funciona con datos sintéticos, claramente marcados en la UI.

## Estructura

```
apps/api      API (Hono + Drizzle, Postgres/PGlite)
apps/web      Web app (React + Vite)
packages/     domain · synthetic · riot · knowledge · analysis · insights · ai
docs/         auditoría, investigación, arquitectura, roadmap, decisiones, fase 1
```

| Documento | Contenido |
|---|---|
| [docs/00-auditoria.md](docs/00-auditoria.md) | Estado del repo, entorno y herramientas |
| [docs/01-investigacion.md](docs/01-investigacion.md) | API de Riot, políticas y fuentes de datos (con nivel de verificación) |
| [docs/02-arquitectura.md](docs/02-arquitectura.md) | Arquitectura y stack |
| [docs/03-roadmap.md](docs/03-roadmap.md) | Fases |
| [docs/04-decisiones.md](docs/04-decisiones.md) | Decisiones, simplificaciones y riesgos |
| [docs/05-fase1.md](docs/05-fase1.md) | Qué hay construido, limitaciones y quality gate |

---

Kairos Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
