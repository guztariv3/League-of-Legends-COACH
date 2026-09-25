# Despliegue y actualizaciones (D-07, D-08)

## Decisiones

- **D-07 · IA:** `claude-opus-5` (variable `AI_MODEL`). Sin `ANTHROPIC_API_KEY`, el Coach explica con texto determinista. Nunca se usa IA durante la partida.
- **D-08 · Hosting:** Render en Frankfurt. Un servicio web con Docker (API y web desde el mismo origen) y Postgres gestionado. Las actualizaciones del escritorio se distribuyen por GitHub Releases.

| Opción | Coste aproximado al mes | Motivo |
|---|---|---|
| **Render** (Starter + Postgres basic-256mb) | **unos 13 $** | Precio fijo, backups, Blueprint en el repo (`render.yaml`) |
| Fly.io | 38 $ o más solo el Postgres gestionado | Demasiado caro para esta etapa |
| Railway | 15–40 $, variable | Facturación por uso, difícil de prever |

Los precios salen de fuentes secundarias de septiembre de 2026 (las webs de los proveedores están bloqueadas en el entorno de desarrollo). **Confírmalos en el panel al contratar.** Gracias al `Dockerfile`, cambiar de proveedor es sencillo.

## Qué se ha verificado

- La imagen Docker se construye y arranca como usuario sin privilegios (`node`).
- Contra **Postgres 16 real**: se aplican las 3 migraciones, funcionan login → vincular cuenta → sync de 50 partidas → dashboard, perfil, objetivos, evolución, historial y revisión de partida, y los datos sobreviven a un reinicio.
- El gate del prototipo: `/api/health` queda abierto (lo usa Render) y todo lo demás pide contraseña. Hay cabeceras de seguridad (CSP, `nosniff`, `frame-ancestors 'none'`) y la ruta SPA sirve la app sin tocar `/api/*`.
- El updater: si una build con updater no tiene clave pública, **se niega a arrancar**; con la configuración correcta arranca normalmente (probado con una clave de usar y tirar que no se guardó).

## Estado del despliegue

**Desplegado en Render** el 25-09-2026 con el Blueprint (`render.yaml`, rama `main`): servicio web `kairos-coach` (`https://kairos-coach.onrender.com`) y Postgres `kairos-db` en Frankfurt.

> Corrección: el 24-09 se dio por desplegado a partir de un log, pero el workspace de Render estaba vacío. El despliegue real es el del 25-09.

| Comprobación | Resultado | Cómo se comprobó |
|---|---|---|
| El servicio arranca | Sí | Log de arranque en Render |
| Gate del prototipo activo | Sí (`gate=on`) | Log de arranque y prompt de contraseña en el navegador |
| La web se sirve desde la API | Sí (`web=served`) | Log de arranque |
| Datos reales de Riot (`data=riot`) | Sí | Log de arranque |
| Vincular una cuenta real y sincronizar | Sí (cuenta de NA) | En la web |
| Datos de las partidas correctos | Sí, coinciden con op.gg | Revisión manual de varias partidas por el propietario |
| IA activa (`ai=on`) | No configurada (opcional) | Sin `ANTHROPIC_API_KEY` |

Lo comprobó el propietario en el panel de Render y en la web. Desde el entorno de desarrollo no se puede verificar: su política de red bloquea `*.onrender.com`.

**Aún sin validar con datos reales:** Perfil, Evolución, Adaptación, revisión de partida, scouting en pantalla de carga y la app de escritorio con una partida real.

Pendiente antes de abrirlo a más gente: rate limiting en los endpoints propios (ver `05-fase1.md`), una **Personal API key** (ver abajo) y sustituir el gate por RSO (D-01).

### Problemas encontrados en el primer despliegue

| Síntoma | Causa | Solución |
|---|---|---|
| El Blueprint no mostraba los recursos | Estaba seleccionado `pnpm-workspace.yaml` y la rama por defecto del repo no es `main` | Elegir **Blueprint Path** `render.yaml` y rama `main`. Conviene poner `main` como rama por defecto en GitHub |
| Pantalla negra con "Unauthorized" | El navegador no mostraba el diálogo de contraseña (probablemente por una extensión) | Abrir la web en una ventana de incógnito u otro navegador |
| "Riot ha rechazado la clave de la API" | La clave de desarrollo caduca cada 24 h | Regenerarla en el portal de Riot y actualizar `RIOT_API_KEY` en Render (**Save, rebuild, and deploy**) |

Antes de PR #4, cualquier fallo de Riot se mostraba como "Algo ha fallado en el servidor". Ahora la web distingue clave rechazada, límite de peticiones y caída de Riot.

## Poner en marcha el prototipo en Render

1. En Render: **New → Blueprint** y elige este repositorio (rama `main`). Render lee `render.yaml`.
2. Render pedirá los secretos marcados `sync: false`:
   - `PROTOTYPE_PASSWORD`: al menos 12 caracteres. Protege todo el sitio (usuario `kairos`). Es obligatorio para poder entrar mientras no haya RSO (D-01).
   - `RIOT_API_KEY`: para un prototipo privado, una **Personal API key** (la de desarrollo caduca cada 24 h y no puede usarse para un producto). Sin clave, la app funciona con datos sintéticos etiquetados.
   - `ANTHROPIC_API_KEY`: opcional.
3. Tras el primer despliegue, abre la URL `https://<servicio>.onrender.com`. El origen permitido se toma automáticamente de `RENDER_EXTERNAL_URL`.
4. Cuando el prototipo funcione con datos reales, solicita la **Production key** en el portal de Riot. Después pide acceso a RSO y sustituye el gate por el inicio de sesión real.

> Seguridad: el login de desarrollo reutiliza el usuario por nombre. Detrás del gate solo deben entrar personas de confianza. **No compartas la contraseña públicamente.**

## CI (`.github/workflows/ci.yml`)

En cada PR y en cada push a `main` se ejecutan typecheck, tests, E2E web y de escritorio, la build de la imagen Docker, y `cargo test` de la app de escritorio.

## Actualizaciones del escritorio (secciones 108–109)

| Paso | Cómo |
|---|---|
| Actualizar | Tag `desktop-vX.Y.Z` → `desktop-release.yml` compila Windows y macOS (universal) con `--features updater`. |
| Validar | Los paquetes van **firmados** y se suben a un **Release en borrador**. Prueba los instaladores antes de publicar. |
| Activar | Al **publicar** el borrador, `latest.json` apunta a esa versión y las apps lo ofrecen **solo fuera de partida** ("Instalar y reiniciar" o "Más tarde"). |
| Si falla | La firma se verifica antes de instalar. Si la descarga o la verificación fallan, se queda la versión instalada y se avisa. |
| Rollback | Publica de nuevo una versión anterior como la más reciente (o elimina el Release defectuoso). |

### Configuración inicial (una vez)

1. Genera las claves en tu máquina: `pnpm --filter @coach/desktop tauri signer generate -w ~/.tauri/kairos.key`
2. En GitHub → Settings → Secrets → Actions, añade:
   - `TAURI_SIGNING_PRIVATE_KEY`: el contenido de `~/.tauri/kairos.key` (**nunca** en el repositorio).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: su contraseña.
   - `TAURI_UPDATER_PUBKEY`: el contenido de `kairos.key.pub`.
3. Sube `version` en `apps/desktop/src-tauri/tauri.conf.json` y crea el tag `desktop-vX.Y.Z` con la misma versión.

### Limitaciones

- Si el repositorio es **privado**, las apps instaladas no pueden leer `latest.json` de GitHub Releases sin autenticación. En ese caso hay que publicar el feed en otro sitio (por ejemplo, el propio servicio de Render).
- **No hay firma de código del sistema operativo** (Authenticode en Windows ni notarización en macOS): Windows SmartScreen y Gatekeeper mostrarán avisos. Hace falta un certificado de pago, que es una decisión de coste pendiente.
- Los minutos de GitHub Actions en macOS cuentan 10× en repositorios privados.
