# Auditoría de primeras compras: Ahri y Smolder

Fecha: 2026-09-28. Base: `02979e8`, PR #51. Datos mecánicos de las fixtures reales 16.19.1. No se modifican dependencias ni se despliega producción.

## Qué se reprodujo

Equipo enemigo: Darius, Viego, Zed, Caitlyn, Lulu. Ahri MIDDLE contra Zed; Smolder BOTTOM contra Caitlyn. Sin objetos terminados propios ni resultados visibles de línea.

- El ejemplo visual de Ahri/Morellonomicon era una selección manual ficticia: no demostraba el motor. No debe presentarse como recomendación validada.
- La alternativa local genérica sí recomendaba Phantom Dancer a Smolder. Clasificaba al campeón por estadísticas generales, sin interpretar su Q. El escritorio deja de usar esa alternativa para objetos terminados: si falta el motor contextual muestra información no disponible.
- El motor contextual, distinto de esa alternativa local, elegía Banshee's Veil para Ahri y Essence Reaver para Smolder. Sobrevaloraba las respuestas defensivas globales y omitía pasivas ofensivas importantes.
- Las estadísticas existentes se mostraban junto a la recomendación, pero no participaban en su ranking. No existían contadores de compras cruzados por matchup.

## Cambios

Se reconocen hechizos básicos de corto enfriamiento que aplican efectos de impacto y escalan con AD. Eso corrige la dependencia de velocidad de ataque inferida para Smolder. Se valora Spellblade, la aceleración de definitiva y el daño activado por definitiva cuando el kit puede utilizarlos. Son reglas sobre mecánicas, no condiciones por nombre de campeón u objeto.

En la primera compra terminada se reduce el peso de counters globales que retrasan el pico ofensivo. Una amenaza relevante en línea conserva más peso, y resultados visibles de un rival aventajado conservan el peso completo. No se supone que todo daño físico implique curación. Los umbrales y pesos siguen siendo heurísticos y requieren calibración; no son una simulación exacta de combate.

En el caso reproducido, Ahri elige Malignance y Smolder Essence Reaver. Las regresiones cubren presupuestos de 300, 1200 y 2700, pasivas retiradas, nombres cambiados y objetos ya comprados. El score se compara con la alternativa para el mismo hueco; antes se comparaba erróneamente con la siguiente compra ya condicionada por la primera.

## Evidencia observada y límites

La API conecta los contadores propios con el motor cuando coinciden campeón, posición explícita y parche actual. Un grupo necesita al menos 100 observaciones y una opción 30. Se pondera frecuencia y WR regularizado hacia el promedio del grupo; un WR de 100% en dos partidas no impulsa la opción. Las cifras incluyen muestra y alcance, y no se presentan como probabilidad de ganar ni causalidad.

Se añaden `matchup_first_item` y `matchup_core` al recolector. Sin muestra suficiente por rival se usa campeón/posición; sin evidencia suficiente se etiqueta la recomendación como heurística. Los contadores se crean al procesar partidas nuevas; los matches ya marcados como contados NO se reprocesan ni se inventa un histórico. No hace falta migración SQL: `kind` ya admite texto. El recolector necesita estar activado y tener acceso Riot; con `stats=off` no habrá nueva evidencia real.

El prior de compras solo se usa cuando no hay un objeto legendario propio terminado. Para las compras siguientes del plan inicial se filtran las secuencias por su prefijo exacto. Con objetos ya terminados se mantiene el motor mecánico: el inventario actual no demuestra el orden de compra. Las secuencias de tres objetos tienen sesgo de supervivencia/completado, que se indica explícitamente.

La muestra interna procede de la recolección Master+. No se mezcla con los datos externos Emerald+ ni se importan porcentajes de una página a producción. Las cifras estadísticas de los tests son ficticias y solo comprueban el comportamiento del código.

## Contraste externo consultado

- https://mobalytics.gg/lol/champions/ahri/build/mid — Emerald+, todas las regiones, Ranked Solo, 16.19: la build más popular comienza con Malignance.
- https://mobalytics.gg/lol/champions/smolder/build/adc — mismos filtros: la build más popular comienza con Essence Reaver.

Son referencias generales del campeón/posición consultadas el 28 de septiembre, no tasas verificadas de esos objetos contra Zed/Caitlyn. Las páginas cambian sus muestras. Coincidir en la primera compra no valida todas las compras siguientes ni convierte el motor en una build óptima por matchup. No se afirma haber obtenido un dataset externo completo por matchup.

## Validación y uso

Regresiones mecánicas con las fixtures del parche, evidencia insuficiente/parche incorrecto/posición incorrecta, conexión real del prior al score, separación de oponentes en API y ausencia de fallback genérico en el escritorio. Se conservan las pruebas de recetas, inventario, reloj, privacidad y respuestas tardías.

Usar API/web y escritorio de esta misma rama. El instalador solo no actualiza el servidor. Falta probar con League real en Windows, y ampliar la calibración a otros campeones, segundas compras y matchups con muestras suficientes. Mantener PR en borrador, sin fusionar, publicar release ni desplegar Render.
