# Validación integral: datos reales, recomendaciones y Windows

Preparado el 28 de septiembre de 2026. No es un acta de aprobación. Los resultados manuales y la cobertura estadística siguen pendientes.

## 1. Congelar la versión a evaluar

Registrar SHA de API/web, SHA del instalador, parche, fecha, región y versión de Windows. Usar API/web y escritorio de la misma revisión del PR #51, que incluye la base del PR #50. Una nueva corrección invalida únicamente los resultados afectados; no atribuir el CI de una revisión a otra. El CI y el instalador de `a3b1856` pasaron. Instalador de prueba sin firmar: https://github.com/guztariv3/League-of-Legends-COACH/actions/runs/36477178933/artifacts/10994775296 (caduca el 12 de octubre). Verificar el SHA antes de descargar. Este protocolo y su SQL no cambian el código de ejecución de esa versión.

Esto no autoriza fusionar, publicar o desplegar. Render aún no lleva estas correcciones. Para pruebas completas usar un entorno de prueba con datos propios; no apuntar un servidor de prueba a la base de producción. Si se propone un despliegue, preparar primero el cambio exacto, migraciones aplicables, copia de seguridad y recuperación, y solicitar la autorización final.

## 2. Evidencia del entorno real ya aportada

El usuario confirmó `RIOT_API_KEY` en Render y compartió:

```
[api] listening on :10000 · env=production · data=riot · ai=off · web=served · gate=off · stats=EUW1+KR+NA1 · knowledge=16.19.1
```

Esto prueba configuración al arrancar, no éxito de solicitudes ni volumen guardado. Las búsquedas de `[stats]`, 401, 403 y 429 no dieron resultados en el intervalo consultado; no prueban ausencia de fallos. No se verificó el tipo/aprobación de la clave. El acceso del agente a Render sigue bloqueado. No compartir claves, DATABASE_URL, códigos de vinculación, cookies o registros de usuarios.

## 3. Obtener evidencia estadística sin desplegar

Si el entorno usa PostgreSQL y existe una consola SQL autorizada, ejecutar `scripts/stats-readonly.sql` allí. El SQL fija una transacción de solo lectura y termina con ROLLBACK. Consulta únicamente tablas agregadas de estadísticas y un resumen por plataforma de partidas procesadas, nunca identidades de jugadores ni tablas de usuarios. El campo `key` de stats_counts es una combinación de ids de objetos/runas/rivales, no una clave de acceso.

No instalar herramientas ni crear un endpoint público para este informe. Si no existe consola o acceso, registrar BLOQUEADO; no se resuelve suponiendo datos ni desplegando en producción. Revisar y exportar los dos resultados como CSV, sin datos de conexión, para analizarlos aquí. La consulta no requiere el código nuevo del PR; requiere las tablas existentes de la fase de estadísticas. Ante tablas ausentes o errores, detenerse y conservar el mensaje sin credenciales.

Con el diagnóstico del PR ya disponible en un entorno de prueba, también puede generarse `stats-coverage.json` siguiendo docs/21. Detener el API local antes de abrir PGlite, conservar PGLITE_DIR de esa sesión y usar el mismo parche. No ejecutar openDatabase ni migraciones para hacer una simple auditoría de producción. En PowerShell usar `pnpm.cmd --silent --filter @coach/api stats:coverage 16.19`.

Para comprobar avance del recolector, comparar dos exportaciones con hora registrada. El intervalo se elige según actividad y límites de Riot; no se promete una cantidad de partidas por minuto. Un incremento de partidas retenidas y categorías demuestra progreso, no representatividad. `processed_at` mide cuándo se procesó, no cuándo se jugó; la retención de ids puede hacer que los totales de stats_matches y stats_counts difieran.

## 4. Criterios para evaluar los datos

| Comprobación | Condición / resultado requerido |
|---|---|
| Procedencia | Confirmar entorno con data=riot, parche y regiones. No mezclar fixtures con observaciones reales. |
| Separación | Evaluar campeón + posición + parche y rival específico cuando corresponda. No trasladar Yasuo mid a top/bot automáticamente. |
| Cobertura | Inventariar todos los campeones/roles del catálogo; distinguir muestra ausente, insuficiente y disponible. No exigir que todos los roles atípicos tengan muestra. |
| Umbrales | El motor muestra opciones con al menos 8 observaciones y admite apoyo estadístico con grupo visible >=100 y opción >=30. La disponibilidad de championStats también requiere >=30 partidas del campeón/rol. Son mínimos técnicos, no garantía de calidad. |
| Categorías | Revisar first_item, core, rune_page, spells y sus variantes matchup. Tener games no demuestra tener cronologías ni páginas completas. |
| Consistencia | Games/wins enteros, 0 <= wins <= games; ids válidos para el parche; roles reconocidos; páginas completas legales; grupos/prefijos de compra separados. |
| Interpretación | WR observado no es causal ni probabilidad de ganar con ese objeto. Revisar frecuencia, muestra, sesgo de completar objetos y contexto. Master+ no representa automáticamente todos los rangos. |
| Datos faltantes | Mantener la explicación heurística o retener la recomendación si faltan mecánicas. No etiquetar como validado ni fabricar porcentajes. |

Los contadores antiguos no se rellenan automáticamente con las nuevas categorías. Una ausencia de rune_page puede ser un hueco de recolección, no una preferencia del jugador. No borrar la base o duplicar partidas para aumentar la muestra.

## 5. Revisión estratégica sobre las muestras disponibles

Para cada combinación con evidencia suficiente, registrar el primer objeto recomendado, sus alternativas, muestra/WR/frecuencia por opción, inventario, oro, rival y la explicación del motor. Comparar por separado reglas mecánicas y evidencia observacional. Los ejemplos prioritarios son Ahri mid, Smolder bot y Yasuo top/mid/bot; no limitan el barrido del resto del catálogo.

Una discrepancia con la opción más popular no demuestra un fallo. Investigar incompatibilidades, falta de amenaza que justifique un counter, pasivas sin disparador, receta, etapa de partida y orden real de compra. No declarar óptima una build solo porque pasó pruebas o porque tiene el mayor WR. Bloquear el cierre de un caso si faltan datos o no hay explicación suficiente; las mejoras que sean demostrables vuelven al PR con regresión.

## 6. Pruebas manuales Windows / League

Usar `docs/23-validation-results.csv`; todas las filas comienzan PENDIENTE. Marcar PASS solo tras observar el resultado; FAIL con reproducción, esperado y observado; BLOQUEADO si falta acceso/dato/función. Un resultado de una partida no valida todos los campeones.

| Caso | Acción | Resultado esperado |
|---|---|---|
| W01 | Vincular app con servidor de prueba y abrir web privada. | Mismo entorno/versión; sin código o token visible en capturas. |
| W02 | Cambiar intención de campeón, confirmar e intercambiar. | Borrador antes del lock; plan de la selección actual; sin respuesta tardía de otro campeón. |
| W03 | Cambiar posición en un escenario controlado (Yasuo top/mid/bot). | Recalcular contexto; no forzar builds distintas si evidencia y kit justifican coincidencia. |
| W04 | Comprar componentes y actualizar inventario/oro. | Secuencia legal; coste restante correcto; sin contar una pieza dos veces. |
| W05 | Llenar seis espacios y mejorar un componente. | No recomendar piezas que no caben; sí permitir combinaciones legales. |
| W06 | Poseer Sheen y botas básicas en escenarios donde sus mejoras sean candidatas. | No bloquear mejoras por consumir la pasiva del componente ni por tener botas básicas; no obligar a recomendar un objeto concreto. |
| W07 | Probar conservación de componente A al priorizar B. | Explicación del desvío; dinero gastado en B no adelanta la ETA de A. |
| W08 | Comparar comprar ahora con ahorrar para una mejora cercana. | Alternativas coherentes, sin instrucción automática de esperar en base; recalcular tras una compra. |
| W09 | Activar Share, comparar app/web y desactivarlo. | Mismo resultado mientras se comparte; limpiar estado al desactivar. |
| W10 | Usar dos cuentas propias de prueba y revocar un dispositivo. | Ninguna cuenta accede al frame de la otra; revocación invalida acceso y frame. |
| W11 | Interrumpir servidor/conexión y restaurarlos. | Estado claro; sin consejos viejos; recuperación con datos frescos. |
| W12 | Pausar, cargar, terminar partida e iniciar otra. | Sin arrastrar consejos entre estados/partidas; historial final solo cuando Riot lo entregue. |
| W13 | Reloj simulado independiente del servidor. | No rejuvenecer capturas; ver docs/16 para prueba de dos equipos. Cambiar el reloj de servidor y app juntos no prueba desfase. |
| W14 | Observar FPS, CPU, memoria y retraso de consejos en condiciones comparables con/sin app. | Registrar equipo, duración y mediciones. Investigar degradación reproducible antes de aprobar; no inventar un umbral ni afirmar rendimiento universal. |
| W15 | Revisar interfaz móvil/escritorio contra las referencias del usuario. | Orden, información y expansión legibles; aprobación visual explícita del usuario. |

## 7. Qué permite cerrar cada etapa

- Ingeniería: CI del SHA evaluado, regresiones relevantes y artefacto del mismo SHA. No sustituye pruebas de League.
- Datos: exportación real revisada y matriz de cobertura; los huecos permanecen identificados.
- Recomendación: revisión por campeón/rol/rival con límites documentados; no una aprobación global por pasar el barrido.
- Producto: casos manuales y revisión visual; documentar pendientes de informe postpartida, economía rival y estrategia profunda.
- Publicación: decisión separada del usuario después de revisar lo anterior. Página pública y clave privada del servidor son conceptos distintos.
