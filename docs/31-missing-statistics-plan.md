# Plan para completar las estadísticas pendientes

Preparado el 29 de septiembre de 2026. Código de referencia: `d6f1095f2cb30ef7e5265f494ab94790b95f45dc`, PR #51 en borrador. Este documento no autoriza ni ejecuta cambios en Render, recuperación histórica, fusión o publicación.

## Punto de partida comprobado

Exportación del parche 16.19, generada el 29 de septiembre a las 04:03 UTC: 59.433 filas, SHA256 `480e43c8f4d026e85364c1b2e7d0b420b02436a8e722fcb562e48fa7557317b7`. Es una fotografía histórica, no el estado actual de producción.

Se revisaron 173 campeones × 5 roles = 865 combinaciones. Hay 232 con muestra suficiente para comparar primeros objetos; 633 todavía no alcanzan ese criterio. Una muestra suficiente no demuestra que el motor recomiende correctamente ni resuelve los kits incompletos. Véanse docs/29 y docs/30.

| Categoría ausente de la exportación | Información que aportaría |
|---|---|
| `rune_page` | Página completa de runas por campeón y rol |
| `matchup_first_item` | Primer objeto terminado contra un rival concreto |
| `matchup_core` | Secuencia de objetos terminados contra ese rival |
| `matchup_rune_page` | Página completa de runas contra ese rival |
| `matchup_spells` | Pareja de hechizos contra ese rival |

Los resultados generales de enfrentamientos ya existentes no son estadísticas de builds por enfrentamiento. Tampoco permiten reconstruir las cinco categorías por deducción. El archivo no contiene los identificadores retenidos ni los registros de enriquecimiento necesarios para calcular cuántas partidas se pueden recuperar.

## Ruta recomendada: ensayo aislado antes de producción

1. Preparar una base PostgreSQL de pruebas y una copia autorizada con respaldo verificable. Mantener sus credenciales privadas. No apuntar el entorno de pruebas a la base de producción. La creación o contratación de recursos no forma parte de este plan.
2. Usar el código de referencia con `STATS_CRAWL=0`. En la copia, arrancar la API nueva para aplicar las migraciones normales, incluida `0010_stats_enrichment.sql`. No permitir escritores antiguos sobre esa copia. El CLI de recuperación no aplica migraciones.
3. Obtener una línea base de cobertura y ejecutar la vista previa siguiente. Ambos comandos se ejecutan desde la raíz del repositorio, con la conexión de pruebas configurada privadamente. La vista previa no consulta Riot ni escribe datos.

```bash
pnpm --silent --filter @coach/api stats:coverage 16.19 > stats-coverage-before.json
pnpm --filter @coach/api stats:backfill 16.19 10 --preview
```

`selected` es el número elegido para este lote, con máximo diez: **no es el total recuperable**. `ambiguousHistoricalMatches` cuenta registros históricos bloqueados por procedencia incierta. Si falta la tabla de enriquecimiento, comprobar la versión y migración en la copia; no borrar ni crear tablas manualmente para sortear el error.

4. Revisar la vista previa. Si existen candidatos, el siguiente ensayo requiere autorización explícita: hasta diez partidas, una sola ejecución, con la clave Riot existente y catálogo exacto 16.19.1. El comando de aplicación está en docs/24. No ejecutar bucles ni programarlo automáticamente. Si otro proceso usa la misma clave, coordinar su presupuesto de API; la pausa del recolector de pruebas no pausa los clientes de producción.
5. Comparar todas las filas de las categorías generales antes/después, no solo sus totales: deben permanecer iguales. Verificar las cinco categorías nuevas y sus registros de procedencia. Reprocesar la misma partida no debe sumar dos veces; ejecutar otra vez el CLI puede seleccionar **otras** partidas, por lo que no demuestra por sí solo idempotencia.
6. Obtener `stats-coverage-after.json` con el mismo comando de cobertura y revisar las diferencias. Un fallo de API detiene el lote; los avances ya confirmados permanecen. Un resultado `unavailable` puede repetirse y requiere revisión, no reintentos ilimitados.

La migración puede clasificar el histórico como `legacy_unknown` si ya había alguna categoría nueva sin procedencia exacta. Es una protección contra duplicados; no se elimina para aumentar cobertura. Las partidas purgadas, omitidas o no disponibles en Riot no son recuperables por esta herramienta.

## Alternativa: recoger solo partidas nuevas

No requiere recuperar histórico. Sí requiere que la API desplegada tenga el recolector nuevo y su migración; instalar únicamente el escritorio no actualiza Render.

Antes de una actualización de producción autorizada, identificar todas las instancias escritoras y pausar los recolectores antiguos antes de migrar. Mantener la nueva versión pausada hasta verificar esquema y procedencia. Solo después habilitar un recolector con las plataformas y frecuencia existentes, sin acelerar las peticiones ni cambiar la clave. Conservar la configuración previa para la operación de despliegue; no improvisar una vuelta a un escritor antiguo que desconozca los registros de enriquecimiento.

Esta vía incorpora las cinco categorías para las nuevas partidas válidas con datos disponibles. No completa automáticamente todos los enfrentamientos. El muestreo actual parte de jugadores Master+ de EUW1, KR y NA1; no representa todos los rangos y no garantiza muestras de roles raros. No se puede prometer una fecha de cobertura completa.

## Cómo medir progreso para todo el roster

- Separar parche, campeón, rol y rival. No mezclar roles, parches o resultados de enfrentamientos con estadísticas de compra.
- Publicar por caso la cantidad observada, las opciones disponibles y el estado: sin datos, muestra insuficiente o muestra suficiente. Mantener explícitos también los casos sin observaciones.
- El criterio estadístico de referencia exige 100 observaciones en el ámbito comparado y una opción con al menos 30; el filtro visual de ocho no reduce el denominador antes de comparar. Validar además legalidad y compatibilidad mecánica.
- Repetir la auditoría individual de docs/29 con una exportación nueva. Comparar los cambios en primera compra, secuencias posteriores, runas y excepciones explicadas por el estado de partida.
- Evaluar cada prefijo de compra por separado. Una primera compra respaldada no respalda automáticamente la segunda, tercera o todo el árbol de componentes.
- La compra de componentes sigue necesitando validación propia de recetas, inventario, oro y situación. Estas cinco categorías no incorporan estadísticas temporales de cada componente ni validan la economía oculta del rival.
- No declarar completados los kits pendientes, la estrategia contextual o la validación con League real por tener más partidas.

## Decisión operativa pendiente

Primero elegir ensayo en una copia de pruebas o recolección de partidas nuevas. El despliegue y cualquier recuperación sobre producción siguen fuera de la autorización actual. No se ha accedido a Render ni modificado su configuración en esta preparación. No hace falta enviar contraseñas o claves por el chat.
