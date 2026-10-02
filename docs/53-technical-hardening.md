# Revisión de los hallazgos técnicos medios

Base remota: PR #52, b6cd0ff (árbol 255d4deda3fc5609bcb8fb86b3f0260737ff4cad), equivalente al HEAD local 9aa4118. No se modifican builds/referencias ni se publica en producción.

## Cambios confirmados

- Preferencias: bloqueo transaccional de la fila del usuario antes de leer/combinar/escribir. También funciona cuando todavía no existe la fila de preferencias. Dos actualizaciones parciales conservan sus campos y sus categorías de memoria.
- Metas: conteo e inserción bajo el mismo bloqueo de usuario, dentro de una transacción. No se exceden tres activas ante solicitudes concurrentes. El cálculo de propuesta ocurre fuera del bloqueo.
- Límites: dev-login 30/minuto por dirección; lecturas autenticadas 1800/minuto por usuario; escrituras 120/minuto; operaciones costosas (sincronización, cuentas, explicaciones, emparejamiento, scouting) 20/minuto por usuario/ruta; escritorio 600/minuto por hash del token antes de consultar la base. Se conservan los límites específicos de login, Live y hora existentes. Cuerpos de petición máximo 96 KiB, manteniendo 64 KiB en Live.
- Cada limitador conserva como máximo 10.000 claves activas. No expulsa contadores activos para permitir reiniciar cuotas; rechaza claves nuevas si está lleno y libera las expiradas. Son límites por proceso, no una cuota distribuida. La identificación por IP conserva la hipótesis existente sobre el proxy; no es protección completa frente a abuso distribuido.
- Replay: al cambiar de partida no se presenta la anterior; se reinician minuto, selección y reproducción. Timelines vacíos/incompletos muestran un aviso. El temporizador ya no actualiza otro estado desde el actualizador del minuto.
- Análisis manual: cambio de cualquier selección invalida la respuesta pendiente y oculta consejos anteriores; solo se muestra la respuesta del último envío aún pertinente. Evita duplicar envíos mientras ese análisis está pendiente.
- Web Live: la bandera stale bloquea consejos y banner aunque la respuesta contenga un frame.

## TLS: cambio parcial y comprobación pendiente

La conexión con el sitio web ya verificaba TLS. No era correcto presentar la excepción como si afectara a toda la comunicación del escritorio.

Live Client Data pasa a verificar cadena y nombre usando exclusivamente el CA público de Riot en su cliente dedicado. Certificado obtenido de https://github.com/RiotGames/leaguedirector/blob/main/resources/riotgames.pem (blob f2f01cb7fd3af4b5824daaeaa727fc8e743f9a97), publicado por Riot para Game Client API: https://developer.riotgames.com/docs/lol#game-client-api_root-certificate-ssl-errors . SHA-256 DER: CA8C9D325B4CDC464C6C94A585C85E91EC23D40BA5BF3AE2822B951A4A504EA3; caduca 2043-11-27. No contiene claves privadas.

Ambos clientes locales rechazan redirecciones y no utilizan proxy. El de partida sigue usando URL fija 127.0.0.1:2999. El de selección de campeones (LCU) usa 127.0.0.1 y puerto/contraseña del lockfile, pero **todavía conserva la excepción de validación de certificado**: no se ha comprobado su cadena real ni que comparta el CA anterior. No se declara cerrado este hallazgo. Requiere inspección del certificado público del cliente real; no hay que compartir el lockfile ni su contraseña. La validación de Game Client también debe probarse con League real antes de publicar el instalador.

## Pruebas

- 892 pruebas unitarias/API correctas, una omitida localmente por requerir PostgreSQL; tipos y compilación web correctos.
- Cinco regresiones nuevas de API fallan sobre el código base y pasan con los cambios: preferencias simultáneas, límite de metas simultáneas, cuotas aisladas, tamaño de cuerpo y memoria acotada del limitador.
- El job PostgreSQL ejecutará también hardening.test.ts para verificar bloqueos con conexiones reales, además de PGlite.
- E2E ampliadas: respuesta tardía de draft; navegación a replay más corto; frame marcado stale con consejos incluidos.
- Rust: servidor TLS local de prueba con certificado ajeno a Riot debe rechazarse; ambos clientes rechazan redirecciones. La clave efímera del servidor de prueba se genera y elimina en runtime. No se añade dependencia Rust.
- CI del PR pendiente al escribir este documento. Este entorno no tiene cargo; el CI debe comprobar Rust y E2E. No se declara validado un instalador con League real.

No se aplican migraciones nuevas. No se cambia Render, main, recolección de estadísticas ni recuperación histórica. Los límites distribuidos, la cadena LCU y la comprobación real de Windows permanecen explícitos.
