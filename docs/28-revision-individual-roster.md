# Revisión individual del roster — 29 septiembre 2026

Estado: cambios de revisión; sin fusión ni despliegue. No certifica builds óptimas.

## Alcance y fuente

Se recorrieron los 173 campeones del catálogo 16.19.1 en cinco roles (865 combinaciones), con cuatro escenarios sintéticos por combinación (3.460 resultados). El escenario principal utiliza el rival más observado del rol y una composición complementaria fija; los otros prueban ausencia de rival, armadura y daño mágico. Son fixtures de diagnóstico, no una enumeración de partidas legales ni de todos los estados de cada matchup.

Fuente: exportación agregada del parche 16.19, 59.433 filas, generada 2026-09-29T04:03:37.967Z. SHA256 del gzip: `480e43c8f4d026e85364c1b2e7d0b420b02436a8e722fcb562e48fa7557317b7`. El archivo permanece fuera del repositorio. No se modificó la base de datos ni se inició un backfill.

## Fallos corregidos

- Una valoración mecánica genérica podía desplazar compras respaldadas por observaciones del campeón y rol. Cuando existen candidatos elegibles suficientemente observados, la comparación se centra en ellos. Se permiten excepciones explicadas por urgencia visible en línea o una receta ya completada en más de la mitad de su coste.
- Un aumento de daño contra objetivos heridos se clasificaba como daño porcentual de vida.
- Se valoraba probabilidad de crítico que excedía el límite.
- Objetos que requieren curar o escudar a otro aliado podían recomendarse a kits sin ese activador. Un rol de soporte no crea esa habilidad.
- Los contadores de runa clave usan `runa:árbolSecundario`. Ahora guían ambos elementos sin fingir que contienen la página completa.
- Las diferencias de mayúsculas en identificadores podían ocultar estadísticas. La lectura agrega variantes sin mezclar roles ni parches; los rivales se comparan sin distinguir mayúsculas.

## Resultados y límites

La regla de muestra exige 100 observaciones del ámbito y una opción con al menos 30. Es un umbral operativo, no una garantía de calidad ni una inferencia causal del WR.

- 232 combinaciones tienen muestra suficiente de primer objeto: 229 con mecánicas disponibles y tres retenidas por kit incompleto.
- 633 combinaciones carecen de esa muestra. Sus recomendaciones mecánicas siguen requiriendo revisión estratégica; no se presentan como estadísticas por rival.
- Cambió el primer objeto en 182 combinaciones de 113 campeones. Antes, 137 combinaciones con muestra suficiente elegían un primer objeto con menos de 30 observaciones; en el escenario principal corregido, ninguna recomendación emitida de ese grupo lo hace.
- 228 combinaciones usan runa clave y árbol secundario observados. Los demás elementos de la página siguen siendo mecánicos.
- Locke y Zaahen tienen mecánicas incompletas: sus diez combinaciones se retienen.
- No hay contadores de páginas completas ni builds por rival en la exportación. Los 20.628 contadores de resultados de matchup no prueban qué build gana ese enfrentamiento.

Se comprobaron 5.130 situaciones de compra: 855 combinaciones con kit disponible, inventario vacío o un componente, y presupuestos de 350, 850 y 1.500. No hubo excesos de presupuesto ni compras fuera de la tienda. Esto no demuestra orden estratégico óptimo, rendimiento en Windows ni adaptación a todos los estados reales.

## Reproducción

Desde `apps/api`, con una copia autorizada de la exportación fuera del repositorio:

```sh
node --import tsx ../../scripts/audit-export-recommendations.ts /ruta/export.json.gz /ruta/recomendaciones.json
```

El informe individual incluye una fila por campeón, cinco filas de roles por campeón, escenarios y compras. La revisión pendiente incluye calidad estratégica de las elecciones posteriores, roles escasos, todos los estados de matchup, mecánicas incompletas y validación con League real. No se deben equiparar pruebas automatizadas en verde con haber resuelto estos puntos.

Validación local: suite completa de 829 pruebas aprobadas y una de PostgreSQL omitida; después del ajuste del formato de runas, 225 pruebas enfocadas aprobadas y una omitida. Typecheck y compilaciones web/escritorio correctos. El CI del nuevo commit debe verificarse por separado.

## Seguimiento: compras posteriores e inventario proyectado

La secuencia del escenario principal tiene 229 primeros objetos, 96 segundos y 48 terceros respaldados por observaciones elegibles. Hay 626 primeros, 759 segundos y 807 terceros emitidos únicamente por mecánicas. Estas cifras corresponden a las elecciones del escenario, no a todos los prefijos posibles de la base. No se debe extrapolar la cobertura del primer objeto a la build completa.

Se reprodujo un fallo de estado: al completar una receta, el motor sumaba las estadísticas del objeto final sin retirar las del componente consumido. La siguiente compra se valoraba contra un inventario ficticio. Una regresión con crítico recibió puntuación 0,28 en esa proyección y 0,70 después de equipar realmente el mismo objeto terminado.

Ahora el estado se recalcula desde el inventario que queda después de cada receta, incluyendo botas. Se cuentan también las copias múltiples realmente equipadas; el conjunto de IDs se conserva solo para evitar recomendaciones duplicadas. Esto corrige el cálculo de crítico, necesidades de maná y amenazas ya cubiertas, sin introducir excepciones por campeón.

La comparación con el escenario neutral deja de afirmar que una secuencia heurística es el build estándar que debe continuarse. Explica que las compras sin observaciones son provisionales y deben revisarse durante la partida.

Validación del seguimiento: la regresión falla antes de la corrección y pasa después; 450 pruebas del motor aprobadas. Tras ajustar el texto, 127 pruebas de motor y coach aprobadas; typecheck correcto. El CI de 26c65bd pasó; el nuevo commit requiere su propia validación. No hubo despliegue, fusión ni recuperación histórica.

Comparación adicional de ambas versiones: 1.720 escenarios de los 173 campeones y cinco roles, con inventario vacío o el primer componente directo del objetivo anterior cuando existe, y rival de línea observado. No cambiaron las secuencias ni sus puntuaciones en esta muestra. La regresión controlada demuestra el defecto, pero esta comparación no demuestra una mejora estratégica del roster. No confundir ausencia de cambios con ausencia del defecto en otros inventarios.

## Seguimiento: disponibilidad real de componentes

El cálculo de economía utilizado para puntuar objetos podía dar valor inmediato a piezas que el plan de compra no permitía adquirir: piezas no vendidas y piezas bloqueadas por las seis casillas ocupadas. Además, deduplicar el árbol por ID ocultaba la segunda copia necesaria cuando una receta exigía dos y el jugador ya tenía una.

Ahora se asignan las piezas del inventario a ocurrencias de la receta una sola vez. Cada opción debe venderse, caber en el presupuesto y disponer de una casilla después de consumir sus propios componentes. Los abalorios no ocupan una casilla normal. Un componente no vendible que ya esté equipado conserva su descuento al mejorarlo. No se supone que el jugador venda objetos para liberar espacio.

Tres regresiones reproducen los fallos antes de corregirlos. Validación final: 577 pruebas de motor, compras y coach aprobadas; typecheck correcto. El script `scripts/audit-recipe-affordability.ts` compara el cálculo de economía con la compra inmediata del planificador: 1.356 escenarios del catálogo, sin discrepancias. Ejecutar desde `apps/api` con `node --import tsx ../../scripts/audit-recipe-affordability.ts`.

Esta corrección compartida por todos los campeones evita valorar compras imposibles u omitir duplicados necesarios. No valida qué pieza aporta más a una pelea, la secuencia óptima del campeón ni los casos sin estadísticas. No se afirma que los 1.356 escenarios cubran todas las combinaciones de inventario. El CI y el instalador de e292c1e pasaron; esta revisión requiere CI nuevo. Sin despliegue, fusión ni backfill.

## Seguimiento: curación real frente a compatibilidad con robo de vida

El detector trataba frases como «aplica robo de vida» como una fuente de curación propia del kit. Eso aumentaba la amenaza de curación aun sin un objeto o habilidad que proporcionara esa estadística y podía aumentar el valor de anticuración.

Ahora se excluyen las cláusulas de compatibilidad y las curaciones expresadas únicamente como una fracción del robo de vida externo. Se conservan curaciones directas y robo de vida otorgado por el propio kit; los objetos del rival continúan aportando sus estadísticas de curación por separado. No hay excepciones por ID de campeón.

Comparación de los 173 kits en tres estados (sin objetos, con componente de robo de vida y con objeto terminado): 519 casos, ocho cambian, todos sin objetos. Akshan, Ashe, Graves, Riven y Samira dejan de recibir curación innata por esa compatibilidad; Smolder conserva R, Volibear W y Xin Zhao P. Los estados con los dos objetos examinados conservan el resultado anterior. Son datos del catálogo incluido, no una estimación de curación real por segundo.

Regresiones anteriores a la corrección fallaban en la atribución de curación a Akshan y en la atribución extra a Smolder. Las pruebas finales cubren los cinco kits sin curación intrínseca detectada, la conservación de curaciones propias y el aumento de utilidad de un componente de anticuración cuando el rival sí compra robo de vida. Validación local: 584 pruebas de motor, compras y coach aprobadas; typecheck correcto.

Esto elimina una razón falsa para anticuración; no prohíbe situacionalmente ese objeto si existe otra fuente de curación o evidencia elegible. Las recomendaciones siguen siendo heurísticas donde faltan muestras; quedan otros límites de interpretación del texto, activación, frecuencia y magnitud de los efectos.

CI anterior (a44bd45): tipos/pruebas/E2E, Rust, imagen de producción e instalador aprobados. El job PostgreSQL aprobó sus siete pruebas pero falló por un evento 57P01 durante el borrado forzado de la base temporal. Se retira FORCE después de cerrar el pool: no se fuerzan conexiones y una fuga real debe hacer fallar la limpieza. Esa modificación solo afecta al test; necesita verificarse en PostgreSQL de CI. Sin acceso ni cambios en Render.
