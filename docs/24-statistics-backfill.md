# Recuperación controlada de estadísticas por enfrentamiento

Estado: preparada para revisión y pruebas. NO ejecutada en Render. No despliega, publica
ni fusiona el PR. Requiere autorización independiente para aplicar cambios en producción.

## Qué recupera

Solo cinco categorías: `matchup_first_item`, `matchup_core`, `rune_page`,
`matchup_rune_page` y `matchup_spells`. Vuelve a consultar la partida y su timeline
con el cliente Riot existente y el catálogo del parche solicitado. No guarda datos
personales nuevos y no modifica contadores de partidas, primeros objetos generales,
cores generales, habilidades ni enfrentamientos generales.

Solo considera identificadores todavía retenidos, `counted=true`, parche exacto y sin
registro de enriquecimiento. No recupera partidas ya eliminadas por retención, partidas
omitidas ni datos que Riot ya no entregue. No garantiza muestras suficientes por matchup.

## Protección contra duplicados

La migración `0010_stats_enrichment.sql` crea un registro por partida. El recolector
normal marca las partidas nuevas en la misma transacción que sus contadores. La
recuperación bloquea la fila de partida y confirma el registro y las cinco categorías
en una única transacción. Un fallo revierte ambos; una repetición no suma dos veces.
La herramienta también excluye otra ejecución simultánea mediante un bloqueo PostgreSQL.

Si antes de migrar un parche ya tiene alguna de las cinco categorías, no se sabe cuáles
partidas la aportaron. La migración marca conservadoramente todo su histórico contado
como `legacy_unknown`: no intenta reconstruirlo ni sumar por aproximación. Solo nuevas
partidas tendrán procedencia exacta. No borres estos registros para forzar el proceso.

## Condiciones previas para un futuro ensayo

1. Usar primero una base PostgreSQL de pruebas con respaldo y verificar las versiones.
2. Detener los recolectores antiguos ANTES de aplicar la migración. No debe existir una
   versión antigua escribiendo partidas durante o después de la migración: no conoce
   el nuevo registro. La migración se aplica por el arranque normal del servidor nuevo;
   esta herramienta nunca la ejecuta automáticamente.
3. Mantener pausada la recolección normal durante la recuperación para no competir por
   el presupuesto de la API. El bloqueo de la herramienta no coordina otros clientes Riot.
4. Configurar privadamente DATABASE_URL y, solo para aplicar, la RIOT_API_KEY existente.
   No imprimirlas ni copiarlas al chat. No requiere nuevas dependencias ni proveedores.

## Uso previsto en el entorno de pruebas

Vista previa (solo lectura, sin llamadas a Riot, sin migraciones):

```bash
pnpm --filter @coach/api stats:backfill 16.19 10 --preview
```

Aplicación explícita de hasta diez partidas con catálogo exacto:

```bash
pnpm --filter @coach/api stats:backfill 16.19 10 --apply 16.19.1
```

El límite admite 1–20. El comando no se programa ni repite solo. Las consultas de catálogo
usan los proveedores ya presentes en el proyecto; si no está disponible la versión pedida,
se detiene. Las partidas se procesan secuencialmente con una pausa entre ellas; los errores
Riot detienen el lote. Los resultados previos confirmados siguen siendo seguros al repetir.
La salida solo muestra cantidades y estados, nunca claves, identificadores ni respuestas raw.

Si falta una partida/timeline, queda pendiente. Un lote repetido podría volver a seleccionar
los mismos registros no disponibles; revisar antes de repetir, no lanzar un bucle ilimitado.
Los tiempos de compra y el WR siguen siendo observaciones, sujetos al sesgo de completar
objetos/partidas; recuperar datos no demuestra que una recomendación sea óptima.

## Criterios de validación

- Vista previa sin escrituras; categoría general intacta tras recuperar.
- Mismo resultado tras repetir o competir por una partida.
- Fallo de escritura revierte registro y contadores; reintento funciona.
- Partida, timeline o parche incorrectos no se contabilizan.
- Timeline ausente queda disponible para reintento.
- Recolector nuevo y registros `legacy_unknown` impiden duplicados.
- Migración diferencia parches ambiguos de parches sin categorías nuevas.

Pruebas automatizadas usan PGlite/PostgreSQL compatible y partidas sintéticas, sin credenciales
ni acceso a Render. Falta ensayo operacional en PostgreSQL con respuestas reales de Riot,
respaldo, pausa del recolector y comprobación de contadores antes/después.

## Ensayo PostgreSQL aislado en CI

El job `Historical enrichment (PostgreSQL)` levanta PostgreSQL 16 temporal en el runner.
No usa secretos de GitHub/Render ni datos reales. Cada prueba crea una base nueva con
nombre aleatorio y la elimina al finalizar. El adaptador rechaza hosts externos y nunca
lee `DATABASE_URL` como destino de pruebas. El servicio desaparece al terminar el job.

Las pruebas de recuperación corren sobre conexiones PostgreSQL reales, incluidas dos
transacciones concurrentes para la misma partida, rollback y CLI de vista previa sin clave
Riot. La prueba específica de clasificación histórica de la migración también sigue
corriendo en PGlite. Esto no sustituye validar respuestas reales de Riot o la operación
con una copia autorizada de datos: demuestra aislamiento y comportamiento de base de datos.
