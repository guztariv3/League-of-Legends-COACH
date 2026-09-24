# Fase 1 · Núcleo funcional

Estado: **completa sobre datos sintéticos**. No se ha probado contra la API real de Riot porque este entorno no tiene acceso a sus dominios (ver `00-auditoria.md`).

## Qué existe

| Área | Implementación |
|---|---|
| Datos sintéticos | `packages/synthetic`: generador determinista (`syn-1`) de partidas y timelines con forma match-v5. Incluye escenarios normal, stomp, comeback, throw, remake, ARAM, timeline ausente y modo no soportado. Usa un catálogo **ficticio** de campeones e items (ids 9000+), sin datos reales inventados. |
| Riot | `packages/riot`: routing por plataforma/región, rate limiter por ventanas leído de cabeceras, reintentos ante 429 (`Retry-After`) y 5xx, y validación Zod de toda respuesta. |
| Conocimiento | `packages/knowledge`: bundles versionados con forma Data Dragon. Validación, activación y rollback. Un bundle roto nunca sustituye al activo. |
| Análisis | `packages/analysis`: métricas por modo; en ARAM no se usan CS/min, oro vs rival ni muertes tempranas. Estadística propia: intervalo de Wilson y t de Welch. |
| Insights | `packages/insights`: detectores → confianza → prioridad → máximo 3 visibles. Cada insight es hecho, observación o hipótesis. Si no hay datos suficientes, el Coach dice que no lo sabe. |
| IA | `packages/ai`: interfaz agnóstica y adaptador de Anthropic. Un **guard de integridad** rechaza cualquier explicación con números que no estén en los datos. Si no hay clave de IA, se usa texto determinista. |
| API | `apps/api` (Hono + Drizzle): Postgres o PGlite embebido, sesiones con cookie HttpOnly (token aleatorio guardado como hash), protección CSRF por Origin y JSON, aislamiento por usuario, multi-cuenta y multi-región, sync inicial de 50 partidas e incremental paginado. |
| Web | `apps/web` (React + Vite): onboarding, Dashboard, Partidas (filtros y detalle con curva de oro), Campeones, Ajustes (cuentas, nivel de explicación, borrado de datos) y Coach global con avatar original. |

## Simplificaciones de esta fase (sección 3)

| Cambio | Por qué | Qué se conserva |
|---|---|---|
| Runner de sync en proceso en lugar de pg-boss | Con una sola instancia, una cola persistente es infraestructura sin uso. Los syncs interrumpidos se reanudan al abrir la app. | Sync automático, reintentos al abrir y progreso visible. |
| Sin sección "Analysis/Replay" en la navegación | No se muestran secciones vacías; llegan en la Fase 3. | La navegación prevista de 5 áreas. |
| Solo tema oscuro | El brief pide dark-first y un único tema reduce el mantenimiento. | Tokens CSS listos para añadir un tema claro. |
| El login de desarrollo reutiliza el usuario por nombre | Solo existe en local (`DEV_LOGIN=1`) y nunca en producción. | Persistencia de datos entre sesiones de desarrollo. |

## Limitaciones conocidas

- Sin acceso real a Riot: faltan por probar Data Dragon real, match-v5 real y los límites de producción.
- Sin RSO (D-01). Las cuentas vinculadas son "no verificadas".
- Sin rate limiting en los endpoints propios. Es necesario antes de cualquier despliegue público.
- El Coach todavía no tiene memoria ni objetivos (Fase 2).

## Cómo probar

```bash
pnpm install
pnpm check                         # typecheck + tests unitarios e integración
pnpm test:e2e                      # Playwright (escritorio + móvil)
pnpm dev:api & pnpm dev:web        # http://localhost:5173
```

## Quality gate

- Typecheck, 47 tests unitarios y de integración y E2E en escritorio y móvil: todos en verde.
- Revisión de código con la skill `code-review`: 6 bugs encontrados y corregidos, con tests de regresión (huecos en el sync incremental, cuentas bloqueadas en "syncing", carrera en el estado, promesas sin capturar, etiqueta de cola y titular del detalle).
- Revisión de seguridad manual (la skill no pudo ejecutarse porque el remoto no tiene rama por defecto): el login de desarrollo pasa a requerir activación explícita.
- Revisión visual de capturas en escritorio y móvil: se corrigieron el wrap de la navegación en móvil y que el Coach repitiera en el Dashboard un insight ya visible.
