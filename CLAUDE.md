# KOI Master — League of Legends AI Coach

Web app + Live Coach de escritorio que analiza las partidas del jugador y le muestra solo lo que necesita. Monorepo pnpm en TypeScript. Estado actual y pendientes: `docs/30-current-status-and-handoff.md`. Decisiones vinculantes: `docs/04-decisiones.md` (D-01 a D-15).

## Estructura
- `apps/api`: API (Hono + Drizzle; Postgres en producción, PGlite embebido en local). Recolector de estadísticas en `src/stats/`.
- `apps/web`: web (React + Vite). En producción la sirve la API desde el mismo origen.
- `apps/desktop`: Live Coach (Tauri v2). Frontend en `src/` (`main.tsx` orquesta la partida en vivo, `board.tsx` la muestra); Rust en `src-tauri/`.
- `packages/`: `domain`, `riot`, `knowledge`, `analysis`, `insights`, `ai`, `review`, `draft`, `live`, `coach`, `build`, `itemization`, `synthetic`, `ui`. Se importan como `@coach/<nombre>`.
- `docs/`: documentación interna numerada (`NN-tema.md`), en español.

## Comandos (Node 22, pnpm 10)
- `pnpm install --frozen-lockfile`
- `pnpm dev:api` (API en :8787, datos sintéticos si no hay `.env`) · `pnpm dev:web` (http://localhost:5173)
- `pnpm check`: typecheck (`tsc` de todo el monorepo) + `vitest`. Los tests unitarios viven en `packages/*/src` y `apps/{api,web}/src` como `*.test.ts`; el escritorio no tiene tests de vitest.
- `pnpm test:e2e` (Playwright, web) · `pnpm test:e2e:desktop` (Playwright sobre la ventana del Live Coach, con IPC de Tauri simulado en `apps/desktop/e2e/*.spec.ts`).
- Un solo test: `pnpm exec vitest run <ruta>` · `cd apps/desktop && pnpm exec playwright test e2e/board.spec.ts -g "<nombre>"`.
- Rust del escritorio: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`.
- En la primera ejecución de los e2e en una máquina nueva: `pnpm exec playwright install chromium`.
- En Windows, con carga alta, algún test de `packages/build` puede superar los 5 s de vitest; si pasa en solitario, es la máquina, no el cambio.

## Reglas de producto (no negociables)
- **Política de Riot (D-02, D-03, D-12):** el Live Coach informa y ofrece opciones, nunca ordena. Nada de ultis ni cooldowns enemigos, ni predicciones de intención o posición enemiga en vivo. El scouting de rivales solo desde la pantalla de carga; el draft analiza campeones, no jugadores. Sin IA durante la partida (D-07).
- **No fingir precisión (D-06):** sin datos validados no se emiten números ni recomendaciones. No rebajar umbrales de muestra para aparentar cobertura; si falta evidencia, se dice.
- **Datos sintéticos** claramente marcados en la UI cuando no hay `RIOT_API_KEY`.
- **Idioma (D-09):** todo lo visible en la app y la web en inglés; la documentación interna en español.
- **La popularidad es evidencia de apoyo, nunca el criterio de la recomendación (D-14).**

## Código
- Sigue el estilo del archivo que toques: el código existente es denso (líneas largas, funciones cortas en una línea), con comentarios en inglés que explican el porqué.
- Las respuestas del motor de builds del sitio en el escritorio deben ir atadas al estado del que se calcularon (inventarios, rol, rival); una respuesta tardía no puede mostrarse como consejo actual.
- Cada corrección lleva un test de regresión que falle antes del arreglo (vitest o e2e del escritorio, según dónde esté el código).

## Git, CI y PRs
- Ramas desde `origin/main`; nunca commits directos en `main`. Commits con mensaje en inglés en imperativo (a menudo `fix:`/`feat:`/`perf:`/`docs:`/`test:`).
- CI (`.github/workflows/ci.yml`): `pnpm check`, e2e web y escritorio, imagen Docker, Rust del escritorio y un ensayo del enriquecimiento histórico contra PostgreSQL aislado. Además, `desktop-test-build.yml` genera el instalador de Windows sin firmar.
- En el PR: qué cambió y por qué, qué se probó (con resultados) y qué queda pendiente. Cambios grandes de comportamiento se documentan en un `docs/NN-*.md` nuevo.

## Despliegue y datos (cuidado)
- Render (`render.yaml`, workspace "LoL Coach"): servicio web `kairos-coach` (Docker, plan `starter`, Frankfurt) + Postgres `kairos-db`. **El auto-deploy está desactivado**: los deploys son manuales y solo con aprobación explícita. Ver `docs/10-despliegue.md`.
- Escritorio: el tag `desktop-vX.Y.Z` lanza `desktop-release.yml` (firmado, Release en borrador). La clave de firma de Tauri nunca va al repositorio.
- No uses la base de producción para pruebas: no copies `DATABASE_URL` de Render, mantén `STATS_CRAWL=0` en local y no ejecutes `stats:backfill` sin una tarea específica y acotada.
- Configuración opcional en `.env.example`. Los secretos (`RIOT_API_KEY`, `ANTHROPIC_API_KEY`, `PROTOTYPE_PASSWORD`) se configuran en Render o en el equipo, nunca en el repo ni en el chat.
