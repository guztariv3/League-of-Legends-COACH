# Fase 5 · Inteligencia avanzada

Estado: **completa sobre datos sintéticos**. El acceso real a Riot sigue bloqueado en este entorno.

## Qué existe

| Área | Implementación | Dónde |
|---|---|---|
| Cambios consolidados (puntos de inflexión, sección 82) | Para cada métrica se busca el punto de corte con mayor \|t\| de Welch (mínimo 10 partidas por lado). Se exige que supere un **test de permutación** (400 permutaciones deterministas) con corrección de **Bonferroni** entre las 6 métricas (α familiar 0,05). | `packages/analysis/src/longitudinal.ts` |
| Jugador frente a entorno (sección 71) | Antes de atribuirte un cambio se comprueba si coincide con un cambio de parche o de campeones, y si también aparece jugando **un mismo campeón** a ambos lados. El resultado se etiqueta como "parece un cambio tuyo" (observación), "puede deberse al entorno" o "origen poco claro" (ambos, hipótesis). | idem |
| Anomalías (sección 81) | z robusto (mediana y MAD) de las últimas 5 partidas frente al resto. Una o dos partidas raras cuentan como **varianza**; tres o más en la misma dirección, como "posible cambio, aún no consolidado". | idem |
| Línea temporal de evolución (sección 83) | Parches, cambios de campeón principal (en bloques de 15 partidas), cambios consolidados y objetivos conseguidos (con su fecha real de cierre). Plegada por defecto. | idem + `/api/evolution` |
| Adaptabilidad (sección 59) | Resultados y riesgo según la clase del rival de línea y yendo con ventaja. Veredictos posibles: posible falta de adaptación, posible sobre-adaptación (menos muertes pero mucho menos farmeo u oro) o sin diferencias claras. **Siempre hipótesis**, con umbral más estricto (\|t\| ≥ 2,8) por comparaciones múltiples. Si no hay nada destacable, se resume en una línea. | `adaptation.ts` |
| Historial de recomendaciones (secciones 40 y 79) | Guarda recomendación, contexto y decisión (aceptada, rechazada, marcada como no útil o consultada) y muestra lo que pasó después con el aviso "no demuestra que la recomendación lo causara". Se puede borrar. | `recommendation_log`, `/api/history` |
| Coach | Dos detectores nuevos: cambio consolidado y posible cambio reciente. **Sustituyen** a los antiguos detectores de tendencia (últimas 10 frente al resto con \|t\| ≥ 2), que tenían demasiados falsos positivos. El perfil usa la misma definición, así que Coach y perfil nunca se contradicen. | `packages/insights` |
| Búsqueda | "¿estoy mejorando?" lleva a Evolución y "cómo me adapto" a Adaptación. | `search.ts` |

## Validación estadística (datos sintéticos, 40 semillas)

| Prueba | Antes | Ahora |
|---|---|---|
| Jugadores estables con algún "cambio consolidado" (falso positivo) | 14/40 (umbral fijo \|t\| ≥ 3) | **1/40** (permutación + Bonferroni) |
| Mejora real de +1,2 CS/min detectada | 40/40 | **40/40** |
| Mejora real de +0,6 CS/min detectada | — | 23/40 (los cambios pequeños necesitan más partidas) |
| Adaptabilidad: veredicto sin efecto real (falso positivo) | — | **0/40** |
| Adaptabilidad: efecto real contra una clase | — | detectado (test) |
| Cambio que coincide con un parche | — | **no se atribuye al jugador** (test) |

## Decisiones (sección 3)

| Decisión | Por qué | Qué se conserva |
|---|---|---|
| **No se detecta automáticamente el nivel del jugador (sección 50)** | Sin rango verificado ni referencias externas, cualquier clasificación Beginner/Expert sería inventada. | Nivel de explicación elegido por el usuario; se revisará con datos reales. |
| **Sin What-if (sección 67)** | Con posiciones por minuto no hay evidencia suficiente para comparar escenarios alternativos. | Revisión de momentos clave con su cambio de oro. |
| **Sin "predicción avanzada" nueva (secciones 31–33)** | Pre-partida ya ofrece hipótesis de composición; en vivo la política lo impide (D-02). | Hipótesis de draft y condición de victoria personal. |
| **Sin simulaciones de combate (D-06)** | Sigue sin haber una fuente fiable de valores de habilidades. | — |
| **Sustituir los detectores de tendencia** | Duplicaban la funcionalidad con peor estadística. | La misma información, más fiable. |

## Rendimiento

Cada métrica cuesta unos 20 ms con 100 partidas (400 permutaciones con sumas prefijo en O(n)). El Dashboard y el Perfil lo recalculan en cada visita. **Pendiente:** cachear por versión de análisis y número de partidas cuando haya usuarios reales.

## Quality gate

- Typecheck en verde, 118 tests unitarios y de integración, y 6 E2E web.
- Validación estadística con 40 semillas (tabla anterior). El primer diseño se **rehízo** por su tasa de falsos positivos.
- Revisión de código con la skill `code-review`: 1 bug corregido con test (el perfil decía "Estable" cuando no había partidas suficientes en el rol principal).
- Seguridad (manual): las rutas nuevas requieren sesión y filtran por usuario (probado entre usuarios); el historial se borra con la cuenta (cascade) o por separado.
- Revisión visual: la sección de adaptabilidad se resume en una línea cuando no hay nada destacable.
