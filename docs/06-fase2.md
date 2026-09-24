# Fase 2 · Personalización

Estado: **completa sobre datos sintéticos**. El acceso real a Riot sigue bloqueado en este entorno.

## Qué existe

| Área | Implementación | Dónde |
|---|---|---|
| Perfil del jugador (el "Player DNA" interno) | Dimensiones: línea, farmeo, visión, riesgo, peleas, estado de partida y campeones. Siempre en comparación con el propio jugador, **sin puntuación global**. Una tendencia solo se muestra si está consolidada (t de Welch ≥ 2 con ≥ 16 partidas). Farmeo se omite para supports y las métricas de Grieta no se aplican a ARAM. | `packages/analysis/src/dimensions.ts` |
| Rendimiento según el estado de la partida | Por delante, igualada o por detrás según la diferencia de oro del equipo al minuto 15 (±1500, umbral heurístico del producto). Muestra victorias con intervalo de Wilson y muertes/min a partir del 15. | idem |
| Patrones entre campeones | Distingue **hábito global** (aparece con ≥ 2 campeones) de **problema de un campeón** (tasa significativamente mayor, z ≥ 2, con ≥ 5 partidas por lado). | `patternScope` |
| Insights nuevos | Ventajas perdidas (hecho), más muertes tras el 15 cuando vas por delante (observación), muertes tempranas con su alcance, y sugerencias de "qué revisar" que nunca son órdenes. | `packages/insights` |
| Objetivos | Opcionales, **máximo 3**, medibles con un catálogo cerrado de métricas. El objetivo propuesto es el nivel que el jugador ya alcanza en su mejor cuarta parte de partidas. Solo cuentan partidas posteriores a su creación. Se considera **consolidado** únicamente con ≥ 10 partidas y el límite inferior de Wilson por encima de la tasa previa. Las sugerencias rechazadas no se repiten. | `goals.ts`, `/api/goals` |
| Memoria del Coach | Tres categorías: enfoque (uno a la vez), correcciones ("no me resulta útil", que oculta ese insight) y notas. Cada elemento se puede ver y olvidar, y cada categoría se puede desactivar o borrar entera. | `/api/memory`, Perfil |
| Enfoque del jugador | Los insights relacionados con el enfoque suben arriba, pero **no se ocultan** los demás. | `generateInsights({ focus })` |
| Búsqueda | Parser determinista. Entiende "A vs B", "mis últimas N partidas con X", roles, victorias/derrotas, ARAM y temas como "¿por qué pierdo la línea?" (lleva a la dimensión del perfil). **Solo navega**: no es un centro de comandos. | `apps/api/src/search.ts` |
| Página de campeón | Capa personal: victorias con intervalo, comparación con tus otros campeones (solo se marca "mejor" o "peor" si la diferencia está consolidada), rivales de línea y partidas recientes. | `/champions/:name` |
| Coach contextual | Deja de repetir lo que ya está en pantalla, se cierra al navegar, acepta "No me sirve" y da una pista en la página de campeón. | `Coach.tsx` |

## Versionado del análisis

`ANALYSIS_VERSION` pasa de 1 a 2 porque se añaden `teamGoldDiff15`, `deathsAfter15` y `queueId`. El sync genera los análisis v2 de partidas ya guardadas **sin borrar los v1**, de modo que la verdad histórica no cambia (sección 70).

## Simplificaciones (sección 3)

| Cambio | Por qué | Qué se conserva |
|---|---|---|
| Player DNA, Perfil, evolución, objetivos y memoria viven en **un área: Perfil** | Evita cuatro secciones sobre el mismo modelo (sección 16). | Todas las capacidades, con divulgación progresiva. |
| Búsqueda determinista, sin LLM | Las consultas del brief se resuelven con reglas. Así es más rápida, gratuita y no puede inventar. | Consultas de campeón, enfrentamiento, historial y temas. |
| Los objetos no se buscan todavía | No hay página de objeto y un resultado sin destino es peor que ninguno. | Llegará con builds (Fase 3). |
| Sin sistema de entrenamiento | El brief lo define como opcional y está fuera del alcance de la Fase 2. | Los objetivos cubren el ciclo detectar → aceptar → medir. |

## Limitaciones conocidas

- Parte de la interfaz muestra el id interno del campeón (p. ej. `MonkeyKing`) en lugar de su nombre visible. Búsqueda y enlaces ya distinguen ambos; el resto se corregirá al probar con datos reales.
- El umbral de ±1500 de oro para el estado de partida es una heurística del producto y habrá que calibrarla con datos reales.
- Sin chat libre con el Coach todavía: requiere decidir D-07 (modelo y coste).

## Quality gate

- Typecheck en verde, 68 tests unitarios y de integración, y 4 E2E (escritorio y móvil).
- Revisión de código con la skill `code-review`: encontró que el id de campeón y su nombre visible se mezclaban en la búsqueda y los enlaces. Corregido y con test de regresión.
- Seguridad (manual): todas las rutas nuevas requieren sesión y comprueban la propiedad (objetivos y memoria por `user_id`), las entradas se validan con Zod, la búsqueda limita la longitud de la consulta y escapa los nombres al construir expresiones regulares.
- Revisión visual: el Coach se cierra al navegar y ya no tapa contenido; se eliminó un bloque duplicado del Perfil y se corrigió el plural de "1 muerte".
