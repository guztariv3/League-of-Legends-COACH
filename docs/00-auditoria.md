# Fase 0 · Auditoría y diagnóstico

Fecha: 2026-09-24 · Rama: `claude/kind-thompson-q7ahjr`

## 1. Estado del repositorio

| Aspecto | Resultado |
|---|---|
| Commits | Ninguno. La rama no tiene historial y el remoto no tiene ramas. |
| Código / framework / backend / BD | No existe. |
| Dependencias, scripts, build, tests, CI, deployment | No existen. |
| Documentación | No existe (este directorio es el primero). |
| Deuda técnica / errores / seguridad | No aplica: no hay código. |

**Conclusión:** proyecto vacío. No hay trabajo existente que preservar ni reescribir; la arquitectura se diseña desde cero (ver `02-arquitectura.md`).

## 2. Entorno de desarrollo disponible

| Herramienta | Versión |
|---|---|
| Node.js / npm / pnpm | 22.22 / 10.9 / 10.33 |
| Rust / Cargo | 1.94 (viable para Tauri) |
| Python | 3.11 |
| PostgreSQL (cliente) | 16.13 |
| Docker | 29.3 |
| Chromium + Playwright | preinstalado (E2E) |

### Restricción de red (importante)

El entorno cloud de esta sesión **bloquea** los dominios de Riot:
`developer.riotgames.com`, `support-developer.riotgames.com`, `*.api.riotgames.com`,
`ddragon.leagueoflegends.com`, `raw.communitydragon.org`. `registry.npmjs.org` sí es accesible.

Consecuencias:
- La documentación oficial se verificó mediante búsqueda web (extractos de páginas oficiales) y no leyendo las páginas completas. Ver nivel de verificación en `01-investigacion.md`.
- No se puede probar contra la API real ni descargar Data Dragon desde aquí. El desarrollo usará el **entorno sintético** (sección 101 del brief) hasta que se permita el acceso.
- Solución: en la configuración del entorno (menú del entorno cloud → Edit → Network access) añadir esos dominios, y añadir una API key de Riot como secreto del entorno.

## 3. Herramientas / skills / plugins disponibles y uso previsto

| Herramienta | Uso en este proyecto |
|---|---|
| `claude-api` (skill) | Diseño e implementación de la capa de IA (modelos actuales, caching, structured outputs). Consultada en esta fase. |
| `artifact-design`, `dataviz` | Design system y gráficos (Dashboard, evolución) cuando se construya la UI. |
| `run` + Playwright/Chromium | Levantar la app y verificar UI/E2E. |
| `code-review`, `security-review`, `simplify` | Quality gate al final de cada fase. |
| `session-start-hook` | Hook para que las sesiones web instalen dependencias y ejecuten tests. |
| GitHub MCP | PRs / CI cuando se soliciten. |
| WebSearch | Investigación (WebFetch bloqueado para la mayoría de dominios). |
| Canva (MCP) | Requiere autorización; no es necesario ahora (el avatar se hará en SVG original). |

No se identificó ninguna skill que sustituya a dependencias clave (ORM, framework UI, desktop runtime), por lo que esas se eligen en `02-arquitectura.md`.
