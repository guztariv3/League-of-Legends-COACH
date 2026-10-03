# Auditoría de compras durante la partida

Continuación local de `08e3498`. Esta revisión comprueba cómo convertir los objetos recomendados en compras posibles con el inventario, el oro y los espacios disponibles. No añade partidas ni cambia las referencias de OneTricks.

## Fallos encontrados y correcciones

### Componentes que la tienda consume aunque estén asignados a otra rama

El árbol completo podía asignar una pieza del inventario a una rama y calcular otra mejora como si esa pieza estuviera reservada. La tienda no permite reservar componentes: al comprar una mejora consume los componentes aplicables que están en el inventario.

En el caso reproducido de Rammus UTILITY, con 1.200 de oro, el plan anterior proponía Ruby Crystal por 400 y después Kindlegem por 800. La segunda compra consume el cristal, por lo que su coste incremental es 400; el saldo y el inventario finales del plan anterior eran incorrectos. Otros errores del mismo tipo aparecían en las rutas de espera de Amumu TOP, Rammus UTILITY, Sion TOP y Zac TOP.

Ahora se reconstruye la receta de cada compra contra el inventario real después de la compra anterior. Esto se aplica al plan contextual, al plan secuencial, al resumen de próxima compra y a la evaluación económica del motor. Comprar otra copia de una pieza no convierte la copia que ya se tiene en un descuento sobre sí misma. En el plan secuencial se ordenan primero las mejoras que consumen piezas, y después las piezas sueltas necesarias, evitando que una mejora se lleve la pieza que se acababa de comprar para otra rama.

### Finalización disponible sin ninguna compra sugerida

En el escenario aislado de Seraphine TOP, con todos los componentes de Imperial Mandate y los 700 de oro necesarios para terminarlo, el plan anterior quedaba vacío. La utilidad genérica de los componentes superaba la estimación del objeto completo y la búsqueda descartaba la mejora.

Cuando la búsqueda no encuentra ninguna compra, ahora permite terminar el objetivo ya recomendado si alcanza el oro, el objeto es comprable, tiene utilidad positiva y cabe tras consumir sus componentes. No reemplaza una alternativa contextual que la búsqueda sí haya encontrado. La corrección es general, sin excepciones por nombre de campeón u objeto.

## Alcance y método

- Datos y recetas congelados del parche 16.19, las referencias existentes por campeón/rol y la exportación autorizada de estadísticas propias.
- SHA-256 de la exportación: `480e43c8f4d026e85364c1b2e7d0b420b02436a8e722fcb562e48fa7557317b7`.
- 173 campeones × cinco roles = 865 contextos. Los contextos sin recomendación inicial se registran como `withheld`, sin inventar un objetivo.
- Inventario vacío con 0, 300, 1.200 de oro y oro desconocido; componentes directos con 0, una moneda menos del coste de combinación y el coste exacto; primer objeto ya completado; seis espacios ocupados; enemigos con armadura y enemigos de daño mágico.
- Además, una comprobación aislada de cada primer objetivo con todos sus componentes y el coste exacto de combinación.
- El orden de objetivos replica el de `liveCoach`: primero, botas y siguientes. Los inventarios, el minuto 15 y el ingreso de 300 de oro por minuto son escenarios sintéticos, no telemetría de usuarios. Los IDs opacos para llenar espacios son bloqueadores de prueba.
- Un verificador separado reconstruye el consumo de componentes, precio incremental, gasto acumulado y espacios después de cada compra. Comprueba tanto «comprar ahora» como la ruta de espera. También comprueba que no se sugiera comprar con presupuesto desconocido ni se vuelva a recomendar como primer objetivo uno ya terminado.

El ensayo no cubre todos los inventarios, cantidades de oro, matchups ni órdenes posibles. Comprueba coherencia y viabilidad de las rutas; no demuestra que cada decisión maximice el WR ni que el valor estimado de cada componente sea óptimo. Las limitaciones de muestras y los desacuerdos documentados en 46–48 siguen vigentes.

## Reproducir

Desde `apps/api`:

```sh
node --import tsx ../../scripts/audit-live-purchases.ts EXPORTACION.json.gz RESULTADO.json
```

Para ejecutar únicamente las finalizaciones aisladas, añadir `--isolated` al final. El script no escribe en la base de datos ni llama a Riot. La exportación cruda y los IDs de jugadores no se incorporan al repositorio.

## Resultados y validación

| Comprobación | Antes | Después |
|---|---:|---:|
| Casos originales | 8.560 | 8.560 |
| Casos con errores de precios/consumo, contando rutas de espera | 7 | 0 |
| Finalizaciones aisladas disponibles con plan vacío | 1 | 0 |
| Casos adicionales con armadura/daño mágico | No ejecutados | 1.710 |
| Total del recorrido ampliado | — | 10.270 |

Los 10.270 registros incluyen 10 contextos retenidos: Locke y Zaahen en los cinco roles, por la limitación de kits ya existente. Los otros 855 contextos se ejecutan en 12 situaciones cada uno: 11 del recorrido motor→plan y una finalización aislada. En los 855 casos aislados se completa el objetivo con su coste exacto. No se detectaron sobrecostes, sobregastos, excesos de espacios, compras con oro desconocido ni repetición del primer objetivo ya completado en los escenarios evaluados.

`50-live-purchase-cases.csv` conserva los 10.270 registros con campeón, rol, escenario, inventario, oro, objetivo y compras ordenadas. La columna de errores resume la validación tanto de la compra inmediata como de la ruta de espera; la columna de compras muestra únicamente la ruta inmediata. Los contextos retenidos no cuentan como compras verificadas.

Las pruebas de regresión cubren el consumo de piezas compartidas, el coste de una copia adicional, el saldo tras varias compras, la mejora disponible en el resumen compacto, los seis espacios ocupados y la finalización que antes quedaba vacía. Una reproducción aislada contra `08e3498` confirmó el orden/precio incoherente y la finalización vacía; ambos desaparecen con la corrección.

Verificación final: **879 pruebas correctas y una omitida por PostgreSQL dedicado**, en 66 archivos. Comprobación de tipos y revisión de espacios del diff correctas. No se repitieron compilaciones de interfaz: esta revisión modifica el motor económico y el planificador, sin cambios de interfaz.

Esta revisión no genera un instalador, no ejecuta Rust ni CI remoto y no valida League real en Windows. Los cambios locales no están publicados en GitHub ni desplegados en Render.
