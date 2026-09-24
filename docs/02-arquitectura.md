# Fase 0 · Arquitectura propuesta

Principios: un solo lenguaje (TypeScript) donde sea posible, pocas piezas, una sola UI para web y desktop, y lógica determinista con el LLM solo como explicador.

## 1. Vista general

```
                ┌──────────── apps/web (React + Vite, SPA responsive) ────────────┐
                │  Dashboard · Matches · Champions/Builds · Analysis · Coach      │
                └───────────────▲──────────────────────────────▲──────────────────┘
                                │ HTTPS (JSON)                 │ misma UI empaquetada
┌──────────── apps/api (Node + Hono) ────────────┐   ┌──── apps/desktop (Tauri v2) ────┐
│ auth (RSO) · accounts · sync · analysis · coach│   │ Live Coach (ventana lateral)    │
│ search · notifications · patch · policy        │   │ lector Live Client Data (Rust)  │
└──────┬───────────────┬───────────────┬─────────┘   │ Safe Mode · Policy local        │
       │               │               │             └──────────────┬──────────────────┘
  PostgreSQL      Riot API        Proveedor LLM                     │ 127.0.0.1:2999 (solo lectura)
 (datos + cola)  (rate-limited)   (vía capa agnóstica)          League (juego)
```

## 2. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Monorepo | pnpm workspaces | Ya disponible; permite compartir tipos y lógica. |
| Frontend | React + Vite + TypeScript, CSS con tokens (sin framework UI pesado) | La misma SPA funciona en la web y dentro de Tauri. No hay necesidad real de SSR (app privada tras login). |
| API | Hono sobre Node 22 | Ligero, tipado y portable a otros runtimes. |
| BD | PostgreSQL + Drizzle ORM (migraciones versionadas) | Relacional con JSONB para los datos crudos de Riot. |
| Jobs / cola | Fase 1: runner en proceso (una instancia). pg-boss sobre Postgres cuando haya más de una instancia. | Evita añadir Redis. Una sola pieza de infraestructura. |
| Desktop | Tauri v2 | Mínimo consumo de CPU y RAM. El lector live está en Rust, fuera del hilo de UI. |
| Validación | Zod (compartido entre API, web y desktop) | Un único esquema para datos de Riot y contratos. |
| Tests | Vitest (unit/integración), Playwright (E2E), datasets sintéticos versionados | — |

## 3. Paquetes internos (módulos, no pantallas)

```
packages/
  riot/        cliente Riot: routing, rate limiter por región (lee cabeceras, respeta 429/Retry-After), caché
  domain/      tipos + normalización (raw → normalized), modos/colas, versiones de parche
  knowledge/   Data Dragon versionado: ingestión, validación, activación y rollback por parche
  analysis/    métricas por modo, clasificación de decisiones, Game State desde el timeline, perfil del jugador
  insights/    "motor de decisión": candidatos → confianza → prioridad → supresión (anti-spam)
  ai/          capa LLM agnóstica: interfaz Provider, router por tarea, fallback, prompts, structured outputs
  policy/      allowlist de funciones sensibles (live/draft/scouting); bloquear o degradar con una alternativa
  synthetic/   generador de partidas/timelines sintéticos versionados + fixtures de regresión
  ui/          design system (tokens, componentes, burbuja del Coach, avatar SVG)
```

Fusiones deliberadas respecto al brief (ver `04-decisiones.md`): Decision, Confidence, Recommendation, Threat/Opportunity y Notification forman **una sola pipeline** en `insights/`. Player DNA, Player Profile, Knowledge Profile y Evolution son **un solo modelo** en `analysis/`.

## 4. Pipeline de insights (el corazón del Coach)

```
datos (raw, normalized) ─► detectores deterministas ─► candidatos {tipo, evidencia, impacto, urgencia}
                                                          │
                                  confianza = f(fuente, frescura, completitud, tamaño de muestra, inferencia)
                                                          │
                     policy (¿permitido en este contexto?) ─► prioridad: crítica | importante | info | suprimida
                                                          │
                          anti-spam + carga cognitiva (Focus Mode) ─► 0..N insights
                                                          │
                            LLM (opcional): redacta la explicación a partir del insight estructurado
```

- **Regla dura:** un insight sin confianza suficiente no se muestra, o se muestra como "No tengo suficiente información fiable".
- Cada insight se etiqueta como **hecho**, **observación** o **hipótesis** (sección 47). El LLM no puede cambiar esa etiqueta.
- Los cambios longitudinales requieren un tamaño de muestra mínimo y un test estadístico simple (intervalos de Wilson / bootstrap) antes de afirmarse.

## 5. Arquitectura de datos (versionada, sin mezclar capas)

| Capa | Contenido | Mutabilidad |
|---|---|---|
| `raw` | JSON de Riot tal cual (match, timeline), con `fetched_at` y versión de API | inmutable |
| `normalized` | participantes, eventos y frames tipados | se regenera desde raw |
| `derived` | métricas y análisis de cada partida, con `analysis_version` y `patch` | inmutable por versión (la verdad histórica no se reescribe) |
| `profile` | modelo del jugador (dimensiones con evidencia) | evoluciona, con historial |
| `memory` | preferencias, objetivos, correcciones, cada una con categoría | editable y borrable por el usuario |
| `knowledge` | datos de parche versionados | activación controlada con rollback |

La privacidad se separa por esquema: identidad, cuentas Riot, datos de juego y memoria del Coach. Los tokens y secretos se cifran en reposo (a nivel de aplicación). Todo es privado por defecto.

## 6. Capa de IA

- La interfaz `AiProvider` tiene `explain()` y `chat()`, con structured output. El primer adaptador usa el SDK oficial de Anthropic. BYOK y modelos locales se añaden como adaptadores adicionales cuando se necesiten.
- Un router selecciona el modelo por tarea (explicación corta, análisis post-game o chat). El modelo por defecto y la estrategia de coste son decisión del usuario (D-07).
- Prompt caching: el prefijo estable (system + conocimiento del parche activo) queda primero y el contexto de la partida al final.
- **En vivo no hay LLM ni Internet en el camino crítico.** Los mensajes live salen de plantillas deterministas locales. El LLM se usa pre-game, post-game y en el chat.

## 7. Live Coach (desktop)

- Tauri lee la Live Client Data API por polling adaptativo (por ejemplo 1–5 s, y menos frecuente en Safe Mode). Es solo lectura, no toca el proceso del juego y ejecuta el pipeline de insights en local.
- Safe Mode: vigila CPU, RAM y el framerate del sistema cuando sea posible y reduce el polling, las animaciones y los análisis.
- Policy local: lista blanca de categorías de aviso permitidas. Ejemplos permitidos: tus power spikes, adaptación de build con opciones, recordatorio de un objetivo que tú fijaste. Prohibidos: órdenes directas, ultis enemigas, cooldowns de summoners enemigos.

## 8. Deployment (propuesta mínima, decisión D-08)

- API y worker en un solo contenedor, con Postgres gestionado. La web es estática (CDN).
- Las actualizaciones del desktop usan el updater de Tauri: artefactos firmados y rollback a la versión anterior si fallan.
- Proveedor concreto: pendiente (implica coste).
