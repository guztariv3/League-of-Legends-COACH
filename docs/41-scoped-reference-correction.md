# Corrección de compras y referencias por campeón y rol

Fotografía histórica de `3342b2c`. La revisión posterior, sus cambios de política y resultados están en `43-remaining-differences-review.md`.

Revisión del 2026-10-01. Base pública: `1421c9b`. Este documento describe una propuesta en una rama de revisión; no acredita un despliegue ni una prueba con League en Windows.

## Qué cambia

- Las compras propias con al menos 100 observaciones comparables y 30 de la opción conservan su tratamiento. Entre 30 y 99 observaciones solo se admite una opción con al menos 30 compras y una mayoría cuyo límite inferior de Wilson al 95 % supera el 50 %. Se etiqueta como muestra limitada; su ventaja de WR no interviene en la puntuación. Esto identifica una frecuencia dominante, no superioridad del objeto ni independencia perfecta entre partidas.
- En cohortes suficientes, una alternativa con menos del 20 % de las compras de la opción más frecuente no se promociona solo por superar 30 observaciones. Para conservar su elegibilidad estadística debe separar favorablemente los intervalos de Wilson de resultados observados. Sigue siendo un filtro prudente de datos observacionales, no una prueba causal. Las adaptaciones por amenaza urgente o inversión en componentes conservan su vía independiente.
- Se registran prefijos de compras de longitud 2–6. Una partida que termina con dos objetos aporta su segunda compra aunque no termine un tercero. Se utiliza una sola cohorte por etapa: los prefijos nuevos y los cores antiguos nunca se suman. El registro atómico por partida mantiene la protección contra duplicados.
- Las referencias externas se usan cuando no queda una opción propia elegible. Exigen campeón, rol y parche exactos. La selección local distingue datos suficientes, datos limitados, referencia externa y estimación mecánica. No transforma los pesos de OneTricks en partidas, victorias o WR.
- Una referencia no permite saltarse restricciones de tienda, inventario, pasivas incompatibles ni ausencia de una amenaza de curación. Una receta muy avanzada o una urgencia visible de línea pueden justificar una alternativa.
- Los primeros objetos, cores y terceras opciones condicionadas a ese core conservan su contexto. Para etapas posteriores solo se usan rutas conjuntas publicadas; no se unen máximos independientes de distintos huecos.
- Se distingue el objeto que se compra de su transformación automática usando el catálogo verificado. Seraph’s Embrace, Muramana, Fimbulwinter y Diadem of Songs remiten a sus precursores de compra. Las mejoras gratuitas de misión de support no cuentan como una compra del core ni bloquean su prefijo al leer el inventario.
- La puntuación mecánica reconoce daño periódico descrito por el kit y la renovación de quemaduras activadas por daño de habilidad. No premia genéricamente intercalar ataques cuando una habilidad básica de daño es canalizada. Son reglas generales basadas en los datos; no excepciones por nombre de campeón.

## Alcance externo

Se consultaron los 173 campeones en cinco roles: **865 contextos**. Tras reintentar los fallos de descarga:

- **647** contextos tienen referencias de compras utilizables, correspondientes a 172 campeones.
- **3** contextos de Kayn muestran rutas separadas por forma. Se conservan para revisión, pero no se mezclan ni se elige una forma sin conocerla.
- **8** contextos solo contienen información de setup, sin una secuencia de compras utilizable.
- **207** contextos no ofrecen rutas del parche 16.19.
- No quedan descargas fallidas. Ausencia de ruta no significa que el campeón sea injugable en ese rol.

Las referencias importadas cubren 149 TOP, 149 MIDDLE, 119 BOTTOM, 102 JUNGLE y 128 UTILITY. Esto no certifica que todas tengan una muestra grande. Los pesos públicos son popularidades sin un recuento de partidas independiente verificado.

El servidor carga una instantánea versionada: no consulta OneTricks al hacer hover ni en cada frame. Cada referencia conserva URL, fecha, parche, rol y hash del HTML recuperado. Se desactiva si cambia el parche, si su fecha está en el futuro o si supera 14 días. La falta o caducidad de una referencia devuelve el tratamiento explícito de evidencia propia/estimación, no una referencia de otro rol.

## Comparación reproducible

La base estadística sigue siendo la exportación autorizada de 59.433 filas, SHA-256 `480e43c8f4d026e85364c1b2e7d0b420b02436a8e722fcb562e48fa7557317b7`. No se han añadido partidas reales ni recuperado historial de producción.

Se ejecuta el motor para los 865 contextos en cuatro escenarios: neutral, composición de referencia, armadura y daño mágico. El CSV `42-before-after-champion-roles.csv` compara antes/después en el escenario neutral con el rol y parche exactos de la fuente. Las discrepancias con el núcleo más popular son señales de revisión; su reducción no mide por sí sola calidad u optimalidad.

## Resultados de esta revisión

| Comprobación | Resultado |
|---|---:|
| Contextos campeón/rol, cuatro escenarios cada uno | 865 / 3.460 ejecuciones |
| Secuencias neutrales que cambian | 591 |
| Primer objeto distinto del principal externo, en 639 comparables | 458 antes → 109 después |
| Primeras dos compras distintas, en 513 comparables | 436 antes → 164 después |
| Morellonomicon en los 865 escenarios neutrales sin curación conocida | 0 |
| Pruebas unitarias/API | 859 correctas; 1 omitida por requerir PostgreSQL dedicado |
| Comprobación de tipos y builds web/escritorio | Correctos |

Ejemplos neutrales del motor, no promesas contra cualquier rival:

| Campeón / rol | Antes | Después |
|---|---|---|
| Aurelion Sol / MIDDLE | Rylai → Malignance → Lich Bane | Rylai → Liandry → Void Staff |
| Aurelion Sol / TOP | Ver CSV completo | Rylai → Liandry → Bloodletter’s Curse |
| Aurelion Sol / BOTTOM | Ver CSV completo | Blackfire Torch → Rylai → Liandry |
| Yasuo / MIDDLE | Phantom Dancer → Infinity Edge → Yun Tal Wildarrows | Immortal Shieldbow → Infinity Edge → Death’s Dance |

Entre las 2.565 compras propuestas en los escenarios neutrales, 387 utilizan observaciones suficientes, 97 observaciones limitadas, 1.199 referencias externas y 882 siguen siendo estimaciones mecánicas. Los diez contextos retenidos corresponden a dos campeones con mecánicas incompletas, en cinco roles cada uno.

**Siguen existiendo 109 discrepancias de primer objeto y 164 de núcleo frente a la ruta principal de OneTricks. No se ocultan ni se declaran resueltas por pasar tests.** Parte de ellas refleja evidencia propia o filtros de elegibilidad y contexto; todas quedan visibles en el CSV para revisión. Una coincidencia con OneTricks tampoco demuestra optimalidad. La prueba real en Windows y la validación de todos los matchups siguen pendientes.

## Límites que siguen abiertos

- No se han ejecutado ni validado todos los enfrentamientos posibles en el motor. Una referencia general de rol no se presenta como una referencia contra un rival específico.
- Las referencias de OneTricks integradas aquí son de objetos; no se reconstruyen páginas completas de runas a partir de fragmentos incompletos.
- Kayn necesita información fiable de su forma para seleccionar una referencia. Locke y Zaahen mantienen la retención de recomendaciones por mecánicas incompletas en el catálogo.
- Las estimaciones mecánicas restantes siguen siendo provisionales. Esta revisión no certifica un build óptimo individual para todos los estados de partida.
- El recolector de producción continúa pausado (`STATS_CRAWL=0`). Registrar nuevas etapas requiere desplegar esta propuesta y reactivar el recolector posteriormente; no se ha hecho aquí.
- El backfill histórico no se ejecuta ni se amplía. Sus categorías y su registro de migración conservan el alcance anterior.

## Actualizar y reproducir

1. `python scripts/audit-onetricks-roles.py CACHE_ROL_PRINCIPAL SALIDA 16.19` consulta los cinco roles con concurrencia limitada y almacena agregados sin identidades. Añadir `--retry-unavailable` reintenta únicamente errores de descarga.
2. `python scripts/import-onetricks-reference.py SALIDA` genera `apps/api/src/data/onetricks-builds.json` a partir de scopes comprobados.
3. Desde `apps/api`, ejecutar `node --import tsx ../../scripts/audit-export-recommendations.ts EXPORTACION.json.gz RESULTADO.json`.
4. `python scripts/compare-reference-results.py ANTES.json DESPUES.json SALIDA docs/42-before-after-champion-roles.csv` produce la comparación.

Los archivos de estadísticas e identidades de jugadores no se suben al repositorio. El cambio se revisa antes de fusionar o desplegar.
