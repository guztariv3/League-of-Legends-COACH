# Revisión de diferencias pendientes con OneTricks

Fotografía histórica de `142eff3`. La calibración posterior se documenta en `46-evidence-calibration.md`.

Comparación posterior al commit local `3342b2c`, sobre las mismas instantáneas del parche 16.19 recogidas el 1 de octubre de 2026. No es una consulta actualizada de producción ni acredita un despliegue. El documento 41 y su CSV 42 conservan la fotografía anterior.

## Alcance y evidencia

Se volvieron a ejecutar los 173 campeones en cinco roles y cuatro escenarios: **865 contextos y 3.460 ejecuciones**. Se diagnosticaron los **186 contextos** que tenían una diferencia de primera compra, de núcleo de dos objetos o ambas. Los conjuntos se solapan: no son 109 + 164 casos independientes.

- `44-comparison-after-review.csv`: los 865 contextos, antes y después de esta revisión.
- `45-discrepancy-diagnoses.csv`: los 186 contextos señalados, resultado final, muestras propias de ambas primeras compras, causa del descarte o puntuaciones de ambos candidatos, y procedencia externa.
- El diagnóstico utiliza una traza del motor por etapa. No atribuye intenciones a partir del nombre del objeto. Una segunda compra solo se compara directamente si coincide la primera; si no, se registra como dependiente de un prefijo distinto.
- La exportación propia sigue siendo la autorizada de 59.433 filas, SHA-256 `480e43c8f4d026e85364c1b2e7d0b420b02436a8e722fcb562e48fa7557317b7`. No se recopilaron nuevas partidas ni se modificó la base de producción.

## Correcciones

### Daño reflejado independiente de la reducción de curación

Un objeto con reducción de curación quedaba descartado si no se detectaba curación, aunque también devolviera daño al atacante. El motor reconoce ahora ese efecto independiente en el texto de la pasiva. No añade una amenaza de curación ficticia ni una bonificación numérica arbitraria. Explica que el daño reflejado requiere recibir ataques.

Esto conserva la elegibilidad de Thornmail, por ejemplo para Rammus, sin habilitar Morellonomicon por sus estadísticas cuando falta una amenaza de curación. La regresión comprueba también que retirar el efecto de reflexión vuelve a excluir la compra en ese escenario.

### Objetos completos que se transforman automáticamente

El criterio `into.length === 0` excluía Whispering Circlet porque su sucesor es Diadem of Songs. Ahora una compra legendaria puede estar completa aunque tenga una transformación posterior, siempre que el catálogo confirme que el sucesor no se compra y que remite a ese precursor. Un sucesor desconocido o una mejora comprable siguen impidiendo tratarlo como terminado.

El motor y el catálogo del recolector comparten este criterio. La transformación no se cuenta como una compra adicional, y tenerla en el inventario no vuelve a recomendar su precursor. Las mejoras automáticas de misiones tampoco se tratan como compras. Esta corrección del recolector solo afectará a futuras ejecuciones después de desplegar; **no repara retroactivamente la exportación ni ejecuta un backfill**.

### Mayoría propia que coincide con la referencia

Una puntuación genérica podía desplazar la compra mayoritaria propia incluso cuando también encabezaba OneTricks. Ahora esa coincidencia puede fijar la compra de base dentro del conjunto elegible, con estas condiciones:

- Al menos 100 observaciones propias comparables y 30 de la opción; el límite inferior de Wilson al 95 % de su frecuencia supera el 50 %.
- Ninguna alternativa propia con al menos 30 observaciones presenta un intervalo de resultados claramente separado y superior.
- La opción encabeza la referencia del mismo campeón, rol, parche y prefijo de compra.
- No se está utilizando una cohorte específica de matchup suficientemente muestreada: esta conserva su propio criterio.
- Se mantienen alternativas por una receta ya comprada en más de la mitad de su valor o por una amenaza urgente sustentada en resultados visibles de línea.

No se suman las poblaciones de ambas fuentes, no se presupone independencia entre ellas y no se convierte popularidad en WR. La explicación declara el acuerdo y su límite; no lo etiqueta como certeza fuerte. Es una política conservadora de selección de base, **no una demostración de superioridad causal**. Amplía la política anterior de usar referencias solo cuando faltaban opciones propias: ahora también permite corroborar una mayoría propia, sin importar compras externas no elegibles a esa cohorte.

## Resultados

| Medida | Antes | Después |
|---|---:|---:|
| Primera compra distinta, entre 639 comparables | 109 | 91 |
| Dos primeras compras distintas, entre 513 comparables | 164 | 145 |
| Contextos originalmente señalados aún diferentes | 186 | 165 |
| Contextos nuevos señalados por esta revisión | — | 0 |

Cambian 27 secuencias neutrales. En 21 de los contextos señalados desaparecen sus diferencias de primera compra y núcleo comparable. **Menos diferencias no equivale, por sí solo, a mejores builds.**

Ejemplos neutrales, no recomendaciones universales contra cualquier rival:

| Campeón / rol | Antes | Ahora |
|---|---|---|
| Aurelion Sol / BOTTOM | Blackfire Torch → Rylai → Liandry | Rylai → Liandry → Bloodletter’s Curse |
| Aurelion Sol / MIDDLE | Rylai → Liandry → Void Staff | Se mantiene |
| Fizz / MIDDLE | Blackfire Torch como primera compra | Lich Bane como primera compra |
| Janna / TOP | Lich Bane como primera compra | Whispering Circlet como primera compra |
| Rammus / JUNGLE | Winter’s Approach como primera compra | Thornmail como primera compra |

## Qué sigue diferente y cómo interpretarlo

Las **91 diferencias de primera compra** quedan identificadas así:

- **82 por ordenación**: 41 dentro de opciones con observaciones propias y 41 dentro de opciones de la referencia externa. Ambos candidatos son elegibles; decide su puntuación. Quedan **pendientes de calibración**, no certificados como superiores a la ruta principal externa.
- **5 por condiciones ausentes en el escenario neutral**: CC, escudos, crítico o la condición de protección mágica correspondiente. La traza documenta la restricción; no afirma que el objeto sea malo en una partida que sí cumpla la condición.
- **4 por la cohorte propia**: la opción externa no supera los filtros estadísticos de elegibilidad de la cohorte local. Los registros muestran las muestras; esto puede reflejar poblaciones distintas y tampoco prueba que la fuente externa esté equivocada.

Las **145 diferencias de núcleo** incluyen 71 donde ya difiere la primera compra, 52 de ordenación de la segunda compra con prefijo coincidente, 21 por condiciones de amenaza y una por elegibilidad en la cohorte propia. No se cuentan las 71 como errores independientes de segunda compra.

No quedan diferencias atribuidas al rechazo erróneo de un precursor completo. No hay trazas ausentes en los contextos comparados. Permanecen 10 contextos sin recomendación por kits incompletos; tampoco se inventan formas de Kayn ni referencias inexistentes. La cobertura externa sigue siendo la descrita en el documento 41.

## Verificación y límites

- **869 pruebas correctas**, una omitida porque requiere PostgreSQL dedicado; 66 archivos de pruebas.
- Comprobación de tipos y compilaciones Vite de web y escritorio correctas.
- **Cero Morellonomicon** entre las compras del núcleo de los 865 escenarios neutrales sin curación conocida.
- Pruebas nuevas cubren reflexión, ausencia de curación, precursor y transformación, catálogo de compras, diagnóstico sin cambios de resultado, mayoría corroborada, prioridad de matchup y excepciones de componentes/urgencia.
- No se ejecutó Rust ni una partida real en Windows en esta revisión.
- No se validaron todos los enfrentamientos posibles, ni se demuestra la optimalidad individual de todos los builds. Las 82 diferencias de ordenación de primera compra y las estimaciones mecánicas restantes siguen abiertas.
- No se subió esta revisión a GitHub, ni se fusionó, publicó o desplegó. El recolector de producción no se reactivó.

## Reproducción

1. Desde `apps/api`, ejecutar `node --import tsx ../../scripts/audit-export-recommendations.ts EXPORTACION.json.gz DESPUES.json`.
2. Desde la raíz: `python scripts/compare-reference-results.py ANTES.json DESPUES.json CACHE_ROLES docs/44-comparison-after-review.csv`.
3. Ejecutar `python scripts/review-reference-differences.py ANTES.json DESPUES.json CACHE_ROLES EXPORTACION.json.gz docs/45-discrepancy-diagnoses.csv`.

`ANTES.json` es el replay congelado del commit `3342b2c`. Los datos crudos propios quedan fuera del repositorio; los informes conservan únicamente comparaciones y estadísticas agregadas.
