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

## User-provided production evidence: 2026-09-28

Read-only Render Shell results supplied as screenshots by the user show 11,502 retained
counted matches for 16.19 (NA1 3,745; KR 3,646; EUW1 4,111), with latest processing
at 21:25:01 UTC. This is a user-executed database observation, not direct agent access
or proof of sustained ingestion rate. Counts and statistics retention differ.

The category report includes 173 champions and 687 champion/role `games` rows for 16.19.
It contains eight categories; matchup purchase categories and complete rune-page categories
are absent. The existing `matchup` category alone cannot establish item win rates against
an opponent. New collector categories in this draft PR are not deployed or backfilled.

A second, top-five-first-item excerpt shows:

| Champion / role | Total games | Most frequent first item | Item games | Item wins |
|---|---:|---|---:|---:|
| Ahri / MIDDLE | 808 | 3118 Malignance | 510 | 264 |
| Smolder / BOTTOM | 80 | 3508 Essence Reaver | 69 | 30 |
| Yasuo / TOP | 336 | 3153 Blade of the Ruined King | 122 | 74 |
| Yasuo / MIDDLE | 804 | 6673 Immortal Shieldbow | 460 | 239 |
| Yasuo / BOTTOM | 319 | 3095 Stormrazor | 86 | 49 |

These are partial observational excerpts, not full database fixtures, causal rankings,
or certified optimal builds. The build audit replays all five provided top-five excerpts;
it does not install them as runtime recommendations. Smolder's sample remains below
the 100-observation gate, and its one-game 100% alternatives receive no empirical bonus.

### Evidence pipeline correction

`championStats` previously removed every option below eight games before handing counters
to the recommendation engine. This altered denominators and could erase supported next
purchases split among rare three-item paths. It now retains separate unfiltered evidence
while preserving the display filter. Champion, role, patch and opponent isolation remain;
100 observations per pool and 30 per candidate are still required after prefix aggregation.
The read-only coverage report now uses the same unfiltered denominators.

Two database-to-engine regressions fail before the correction and pass after it: rare
paths aggregating to 100 next purchases, and small outcomes retained in the baseline
without becoming eligible recommendations. This correction applies to all champions and
roles. It does not certify strategic quality or solve the missing production categories.

### Consistent comparison scope

Purchase evidence now selects matchup versus champion/role scope once per purchase
prefix, independently of the candidate. A supported matchup cannot score one option
using opponent-specific observations while rewarding another using general popularity.
Unsupported options remain mechanically eligible but receive no empirical bonus in that
comparison. Sparse matchups still fall back as a whole. The same rule already applies
to setup observations. Two synthetic regressions cover initial purchases and subsequent
prefixes, including isolation when the requested opponent changes.

User decision: historical recovery remains pending; do not run it in Render. New-category
collection after a separately authorized deployment is the intended path for now.
