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
