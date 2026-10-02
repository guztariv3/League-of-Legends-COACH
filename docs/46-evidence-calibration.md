# Calibración del orden de compras

Revisión posterior al commit local `142eff3`. Conserva las mismas estadísticas propias y referencias de OneTricks del parche 16.19; los cambios medidos proceden del criterio de selección, no de añadir partidas. El documento 43 conserva la revisión anterior.

## Qué se corrige

La puntuación anterior sumaba dos componentes: una estimación genérica de estadísticas/pasivas y una contribución de compras observadas o de popularidad externa. La estimación genérica podía dominar incluso cuando había una ruta válida y específica del campeón, rol y etapa. Esto explicaba buena parte de las diferencias pendientes.

Ahora, dentro de las opciones respaldadas y elegibles, el orden de base utiliza la evidencia de compra. El motor compara el valor mecánico del objeto en la partida con su valor en un escenario neutral, manteniendo el mismo campeón, rol e inventario. Solo esa diferencia contextual, junto con los componentes y el tiempo de compra, ajusta el orden respaldado por datos. El valor genérico del kit no se cuenta de nuevo como otra razón para desplazar la ruta observada.

La puntuación es `1 + contribución de evidencia + ajuste contextual`. La constante 1 solo traslada el origen de la escala, sin alterar la clasificación. No es una probabilidad, una medida de daño ni una predicción de WR. En ausencia de observaciones o referencias elegibles se mantiene el tratamiento mecánico, etiquetado como estimación.

Se conservan los filtros de legalidad, pasivas incompatibles, prefijos, campeón/rol/parche, curación y otras amenazas, así como la prioridad de cohortes propias y de matchups suficientemente muestreados. La regla anterior de mayoría propia corroborada sigue aplicándose con sus excepciones por urgencia o receta comprometida. Las referencias externas no reemplazan una cohorte propia elegible.

## Resultados observados y empates

Las pequeñas diferencias de WR entre opciones con intervalos superpuestos ya no aportan una bonificación que invierta el orden por frecuencia. Una alternativa necesita un intervalo de Wilson de resultados claramente separado por encima del de la compra más frecuente para recibir crédito de resultados, y ese crédito sigue siendo limitado. Esta condición conservadora no demuestra causalidad ni elimina el sesgo de completar objetos, la selección de jugadores o la dependencia entre partidas.

Cuando esa alternativa elegible con resultados claramente separados también encabeza la referencia externa exacta, se conserva como base corroborada frente a la compra más frecuente. Se aplica a la cohorte general, nunca para sobreescribir un matchup propio suficientemente muestreado, y conserva las excepciones por urgencia y receta comprometida. Esta regla general corrige los casos detectados de Mordekaiser TOP y Jayce JUNGLE, sin usar sus nombres en el motor.

Las muestras limitadas continúan sin bonificación de WR. Cuando dos referencias externas tienen el mismo peso y el mismo ajuste contextual, se conserva su orden en la fuente; no se decide por el ID numérico del objeto. Los residuos numéricos menores de 1e-12 no rompen ese empate. La alternativa empatada se muestra como cercana, no como inferior demostrada.

La certeza de las clasificaciones basadas en datos queda limitada: una diferencia de puntuación no se presenta como evidencia fuerte de un build óptimo.

## Informes reproducibles

- `47-calibrated-champion-roles.csv`: los 865 contextos campeón/rol, con las secuencias antes y después.
- `48-calibrated-differences.csv`: la unión de casos discrepantes antes o después, incluidos los nuevos. Contiene la causa, las puntuaciones y las muestras de primera y segunda compra; las segundas compras solo se comparan directamente cuando coincide el prefijo.
- Las trazas distinguen valor mecánico neutral y ajuste contextual. La traza no cambia el resultado y no se añade al flujo normal de la app.

La comparación ejecuta 173 campeones × cinco roles × cuatro escenarios (neutral, composición de referencia, armadura y daño mágico): 3.460 llamadas al motor. La concordancia con OneTricks **no es una validación independiente**, porque esa misma referencia participa en la selección. No debe interpretarse como un porcentaje de acierto ni como mejora demostrada del WR.

## Validación

Las regresiones verifican que inflar artificialmente el AP de una alternativa no desplaza una ruta externa en el escenario neutral, que los datos propios determinan la base, que los enemigos físicos/mágicos todavía cambian elecciones defensivas, que los empates conservan la alternativa y que resultados de WR superpuestos no alteran la bonificación por frecuencia. Se mantienen las pruebas previas de componentes, urgencia, matchups, curación y transformaciones.

Esta revisión no publica, fusiona, despliega ni reactiva el recolector. No aporta partidas nuevas, no cambia la exportación histórica y no prueba el uso real en Windows. Tampoco valida todos los matchups posibles ni certifica builds óptimos para todos los estados de partida.

## Resultados definitivos

| Medida | Antes (`142eff3`) | Después |
|---|---:|---:|
| Primera compra diferente de la principal externa, 639 comparables | 91 | 25 |
| Dos primeras compras diferentes, 513 comparables | 145 | 44 |
| Contextos distintos al comparar primera compra y núcleo | 165 | 54 |

Cambian 174 secuencias neutrales. De los 165 contextos señalados antes, 115 dejan de diferir y 50 siguen diferentes. Aparecen cuatro contextos nuevos: **Ambessa TOP, Lux UTILITY, Syndra MIDDLE y Xayah BOTTOM**. Los 169 contextos de la unión se conservan en el CSV 48; no se ocultan los cambios que reducen concordancia.

Los cuatro casos nuevos se explican por preferencias distintas entre la cohorte propia y la fuente externa:

| Contexto y etapa | Principal externo: muestra propia | Selección actual: muestra propia |
|---|---|---|
| Ambessa TOP, tras Eclipse | Black Cleaver: 71 compras, 57,7 % victorias | Spear of Shojin: 110, 60,0 % |
| Lux UTILITY, primera compra | Luden’s Echo: 78, 41,0 % | Shurelya’s Battlesong: 81, 45,7 % |
| Syndra MIDDLE, tras Blackfire Torch | Cosmic Drive: 137, 55,5 % | Hextech Rocketbelt: 170, 54,7 % |
| Xayah BOTTOM, tras Yun Tal Wildarrows | Infinity Edge: 84, 60,7 % | Navori Flickerblade: 97, 47,4 % |

Estas son observaciones propias de compras completadas, **no el WR publicado por OneTricks ni prueba de que la selección actual sea superior**. En particular, la diferencia de resultados de Xayah no supera el criterio conservador de separación de intervalos aplicado aquí. No se oculta ese desacuerdo ni se fuerza a cero mediante reglas individuales.

Las 25 diferencias restantes de primera compra se dividen en **16 por evidencia propia distinta**, **5 por amenazas ausentes en el escenario neutral** y **4 porque la opción externa no supera la elegibilidad de la cohorte propia**. Ya no hay diferencias de primera compra atribuidas al peso de eficiencia genérica ni al desempate por ID.

Las 44 diferencias de núcleo incluyen 15 donde ya difiere la primera compra, cinco de evidencia propia para la segunda compra con prefijo coincidente y 24 por filtros de elegibilidad o de amenazas. Esas 15 no son errores independientes de segunda compra. Quedan explícitamente fuera de la comparación de dos objetos los contextos donde la fuente solo permite comparar uno.

Ejemplos neutrales finales:

- Aurelion Sol TOP, MIDDLE y BOTTOM: Rylai → Liandry → Bloodletter’s Curse.
- Ahri MIDDLE: Malignance → Lich Bane → Rabadon.
- Akali MIDDLE: Hextech Gunblade → Shadowflame → Rabadon.
- Smolder BOTTOM: Essence Reaver → Black Cleaver → Spear of Shojin.
- Mordekaiser TOP empieza por Riftmaker y Jayce JUNGLE por Youmuu, aplicando la regla general de alternativa con resultados separados corroborada por la referencia.

Son resultados del escenario neutral del motor, no promesas contra cualquier composición. Entre las 2.565 compras neutrales propuestas, 407 usan observaciones suficientes, 99 observaciones limitadas, 1.190 referencias externas y **869 siguen siendo estimaciones mecánicas**. Persisten diez contextos retenidos por kits incompletos.

Verificación final: **875 pruebas correctas, una omitida por PostgreSQL dedicado**, comprobación de tipos y compilaciones Vite de web/escritorio correctas. **Cero Morellonomicon** en las compras del núcleo de los 865 escenarios neutrales sin curación conocida. Rust, CI remoto, instalador y partida real en Windows no se ejecutaron en esta revisión.

## Reproducir la comparación

1. Desde `apps/api`: `node --import tsx ../../scripts/audit-export-recommendations.ts EXPORTACION.json.gz DESPUES.json`.
2. Desde la raíz: `python scripts/compare-reference-results.py ANTES.json DESPUES.json CACHE_ROLES docs/47-calibrated-champion-roles.csv`.
3. `python scripts/review-reference-differences.py ANTES.json DESPUES.json CACHE_ROLES EXPORTACION.json.gz docs/48-calibrated-differences.csv`.

`ANTES.json` corresponde al replay congelado de `142eff3`. La exportación autorizada mantiene el SHA-256 `480e43c8f4d026e85364c1b2e7d0b420b02436a8e722fcb562e48fa7557317b7`. No se incorporan datos crudos ni identidades de jugadores al repositorio.
