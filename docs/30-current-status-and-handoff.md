# Estado de la revisión y validación pendiente

29 de septiembre de 2026. PR #51 en borrador. Sin fusión, despliegue en Render, publicación ni recuperación histórica.

## Qué queda comprobado

- Catálogo completo: 173 campeones, cinco roles, 865 combinaciones. `29-current-roster-review.md` muestra el resultado y el respaldo de cada compra por separado. Son escenarios automatizados, no 865 validaciones estratégicas manuales.
- Se corrigieron usos incorrectos de evidencia de compras/runas, compatibilidad de curación, estadísticas de componentes consumidos, disponibilidad de piezas y duplicados de recetas. La penetración mágica plana ya no hereda el aumento de valoración de la porcentual frente a resistencia mágica comprada.
- La comparación de runas usa la combinación observada completa de runa clave y árbol secundario, incluyendo su peso estadístico. Las runas menores siguen siendo estimaciones donde no hay páginas completas.
- En esta revisión, ambas regresiones nuevas fallaron antes y pasaron después. Suite local completa: 842 aprobadas y una omitida por PostgreSQL local no disponible. Typecheck y builds web/escritorio aprobados.
- CI e instalador del commit anterior e2d3ad7 aprobados, incluida la corrección de la limpieza de PostgreSQL. El commit que incluya este documento debe comprobarse por separado; la entrega del PR identifica su SHA y sus workflows.

## Qué no se puede dar por terminado

| Pendiente | Qué falta concretamente | Cómo se puede cerrar |
|---|---|---|
| Estadísticas por rival | La exportación no contiene builds ni páginas completas por matchup. Tener resultados del enfrentamiento no identifica qué build los produjo. | Recopilación de las categorías nuevas con una versión compatible. La recuperación histórica preparada sigue aplazada y requiere una operación separada y acotada. |
| Roles con poca muestra | 633 combinaciones no alcanzan el umbral operativo del primer objeto. | Acumular observaciones y volver a medir cobertura. No rebajar el umbral para aparentar cobertura. |
| Compras posteriores | En el escenario principal solo 96 segundas y 48 terceras compras tienen respaldo elegible. | Muestras de prefijos reales y revisión estratégica de las alternativas mecánicas. |
| Dos kits incompletos | Falta detalle suficiente de Locke y Zaahen en la fuente incluida. | Incorporar una fuente verificable del parche y revisar las mecánicas antes de emitir recomendaciones. |
| Calidad estratégica individual | Ponderaciones heurísticas, interpretación de texto y muestras observacionales no garantizan una build óptima. | Comparar decisiones con estados reales, inventario, recursos, amenazas, objetivos y resultado; corregir causas reproducibles. |
| Windows y League | No se han ejecutado aquí el cliente instalado, una partida real ni mediciones de CPU/latencia durante ella. | Prueba del instalador y API/web del mismo SHA, registrando estado esperado, resultado y versión. |
| Funciones amplias del coach | Perfiles completos de equipos, curvas de poder, interacciones exhaustivas y economía futura rival continúan parciales. | Seguir el mapa de `19-requirements-and-roster-status.md`; no inventar cartera rival ni prometer funcionalidad completa. |

## Prueba integrada sin modificar producción

La entrega más reciente del PR indica **un SHA y su instalador correspondiente**. Las guías antiguas fijan otras versiones y no contienen todas estas correcciones. Utilizar el código de ese SHA para API/web y su propio instalador de Windows. Instalar solamente el escritorio no cambia el motor que siga ejecutándose en Render.

En PowerShell normal, comprobar Git, Node >=22 y `pnpm.cmd` 10.33.0. Crear un checkout de prueba separado, fijarlo al SHA entregado, ejecutar `pnpm.cmd install --frozen-lockfile` y `pnpm.cmd --filter @coach/web build`. Los pasos de servidor local, cuenta nueva, enlace y pruebas están en las secciones 3–final de `25-windows-test-guide.md`; usar un directorio de datos nuevo para esta versión, nunca la base de producción.

Una prueba local vacía no reproduce las muestras de la exportación ni valida WR. Mantener `STATS_CRAWL=0`, no copiar `DATABASE_URL` de Render y no ejecutar backfill como parte de esta prueba. Las credenciales existentes, si se necesitan para datos reales, se configuran privadamente en el equipo; no se envían por chat ni se guardan en el repositorio.

Comprobar conexión, draft/cambios de rol, orden de compras y componentes, Share, reconexión, fin de partida y rendimiento. Para cualquier fallo, conservar el SHA/versión, campeón, rol, rival, inventario, oro y texto exacto del consejo. Esos datos permiten una regresión concreta. Una captura aislada de un objeto no demuestra por sí sola que toda la regla sea correcta o incorrecta.

El resultado de esta revisión es una versión comprobable con limitaciones explícitas. No es una aprobación para publicar ni una afirmación de que todos los campeones tengan recomendaciones óptimas.
