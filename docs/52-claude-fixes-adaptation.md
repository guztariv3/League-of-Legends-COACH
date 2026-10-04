# Adaptación de las correcciones de Claude

Origen revisado: `bcd6f31aef4d0d15e6a28d6071e6fff903c00ad1`, rama `fix/codex-review-high-findings`, basada en `ed94790`. Esa base precede en 131 commits a la base de nuestro PR #52. La adaptación parte del árbol validado del PR #52 (`920eda4`, idéntico al árbol local `ba75ed8`). No reemplaza archivos actuales por sus versiones antiguas.

## Revisión y cambios

### Login de desarrollo

La propuesta original permite omitir el token y permite al primer navegador reclamar un usuario antiguo sin comprobar propiedad. Se requiere ahora un token aleatorio de 32 bytes, se guarda solo su hash y se conserva la prohibición de usar dev-login para cuentas con contraseña. El navegador conserva el token en localStorage; si el almacenamiento falla, lo mantiene en memoria durante la página, sin regenerarlo en cada intento.

Un usuario antiguo sin token solo puede vincularlo con una sesión válida de ese mismo usuario. Quien haya perdido esa sesión debe usar sus credenciales normales si las tiene; no se habilita recuperación por conocer el nombre.

**Migración de identidades antiguas (revisión adversarial de Codex).** Antes, el formulario de dev-login era la única vía para vincular el token, y solo aparece sin sesión: un usuario antiguo sin contraseña podía seguir usando su sesión y, al cerrarla o caducar (30 días), quedarse fuera de su perfil para siempre (`name_taken`). Ahora `/me` informa `devLoginBound` y `POST /me/dev-token` (autenticado) vincula el token de este navegador a la cuenta en sesión. La web lo llama en cuanto carga una sesión sin contraseña ni token, así que basta con que el usuario abra la web una vez antes de cerrar sesión. Nunca sustituye el token de otro navegador (409 `dev_token_bound`), no se aplica a cuentas con contraseña y respeta el índice `users_claimed_dev_name` (409 `name_taken` si otra identidad sin contraseña ya tiene ese nombre con token).

Quien ya no tenga una sesión válida al desplegar no puede recuperar su identidad desde la app, y esta versión no incluye herramienta de recuperación. Antes de desplegar, contar los afectados con una consulta de solo lectura en producción:

```sql
SELECT count(*) AS sin_contrasena_ni_token,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()
       )) AS sin_sesion_valida
FROM users u
WHERE u.password_hash IS NULL AND u.dev_login_token_hash IS NULL;
```

(Si la columna `dev_login_token_hash` aún no existe, todavía no se ha aplicado 0012: quitar esa condición.) Si `sin_sesion_valida` es mayor que cero, decidir antes del despliegue cómo recuperarlos tras verificar al propietario; no hacerlo por nombre. Se bloquean nombres ambiguos heredados. La creación concurrente de identidades nuevas se protege con índice único parcial; las identidades existentes se bloquean durante la transacción de login. Los clientes antiguos de dev-login deben actualizarse y enviar token. El login público con contraseña conserva sus límites y comportamiento.

### Borrado

La versión actual ya eliminaba análisis mediante `forgetPlayers`; se conserva esa función y se amplía la limpieza a partidas/timelines capturadas antes del borrado. Captura, borrado y limpieza pertenecen a una transacción. Se respetan otras cuentas que usan la partida y los análisis de jugadores todavía vinculados. Los análisis huérfanos de scouting de una partida afectada se limpian antes de borrar su raw para no violar claves foráneas. No se hace una purga global de datos recientes ajenos a la operación.

Dentro del proceso, el borrado bloquea nuevas sincronizaciones de esas cuentas y espera las escrituras activas antes de borrar. Esto puede hacer esperar una solicitud de borrado mientras finaliza una sincronización. No se presenta como coordinación distribuida de múltiples instancias.

### Sincronización

Se conserva un offset y un límite superior de tiempo para la ventana pendiente. El wrapper de Riot transmite `endTime`; la fuente sintética aplica ambos límites. Cada pasada consulta como máximo 300 IDs, incluidos los conocidos: encontrar partidas enlazadas no permite saltarse posibles huecos posteriores.

El offset solo avanza tras ingerir toda la pasada. El watermark solo avanza al confirmar el final, usando el comienzo de la ventana original, incluso si se termina varias horas después. Un fallo conserva ventana y cursor para reintentar. La renovación de PUUID tras cambio de clave reinicia ambos. Se mantiene el alcance inicial de las últimas 50 partidas; esta corrección no ejecuta recuperación histórica ni recupera automáticamente huecos que ya quedaron por debajo de un watermark antiguo incorrecto.

El filtrado temporal limita cambios de la lista, pero no convierte la API de Riot en una instantánea inmutable: indexación tardía o eliminación de partidas antiguas requiere una estrategia adicional de reconciliación. No se ha llamado a Riot real en esta revisión.

## Migraciones y compatibilidad

- `0011_sync_resume.sql`: offset no negativo y fin de ventana pendiente.
- `0012_dev_login_token.sql`: hash del token e índice para nombres de desarrollo ya reclamados.
- No se modifican las migraciones 0001–0010 ni se importan las 0004/0005 de la rama antigua.
- Aplicadas únicamente en bases PGlite de prueba. Ninguna base de producción ha sido modificada.

## Validación local

- 887 pruebas correctas, una omitida por PostgreSQL dedicado, en 67 archivos; typecheck correcto.
- Compilación Vite de web correcta.
- Casos nuevos: 410 partidas en varias pasadas y reinicio; partida nueva entre pasadas; fallo tras 60 ingestas y recuperación completa; borrado con sync activo; cuentas con mismo y distinto PUUID que comparten raw; rechazo de token ajeno/ausente; protección de cuentas con contraseña; reclamación de identidad antigua solo con sesión; creación concurrente; usuario antiguo que vincula su navegador con `/me/dev-token`, cierra sesión y vuelve a entrar por nombre (y e2e web que comprueba que el navegador envía su token al cargar esa sesión).
- Se conserva y amplía la prueba de cambio de clave/PUUID. El test del cliente HTTP verifica que los límites temporales se envían en la URL.
- E2E local bloqueado antes de ejecutar aserciones por `listen EPERM` en el puerto de pruebas. Debe verificarse en el CI del nuevo PR; el verde anterior del #52 no cubre estos cambios.

Los hallazgos medios mencionados por Claude no se declaran resueltos por esta adaptación. No se ha fusionado, desplegado ni cambiado la configuración de Render.
