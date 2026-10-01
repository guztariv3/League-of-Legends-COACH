# Requisitos pendientes y cobertura por campeón/posición

Revisión: 2026-09-28. Extiende los PR #50 y #51; no sustituye el Coach profesional ni declara todos sus requisitos completos.

## Respuesta directa

El documento «Three required product changes — Draft Coach, Build Economy, and Web Live Companion» NO está completado íntegramente. Hay implementación y pruebas de los sistemas compartidos, pero quedan contenidos estratégicos sin calibrar, datos no disponibles y validación con League real. Una prueba automatizada aprobada no acredita una recomendación óptima.

## Mapa del documento solicitado

| Requisitos | Estado comprobado / límite |
|---|---|
| 1.1–1.3 Hover real, cambio de candidato, diferencia frente a lock | Implementado mediante acciones pick/intención del LCU. El defecto original era leer solo el campeón del equipo. Ahora prioriza la acción activa; no promete detectar el movimiento del ratón sin intención seleccionada. Falta verificar el cliente instalado en Windows. |
| 1.4–1.6 Análisis de equipo, enemigo, kit y encaje | Parcial: daño, recursos, dureza, CC y señales del kit; no mapa completo validado de interacciones, peel, engage, presión y escalado de cada matchup. WR no es el único criterio. |
| 1.7–1.8 Draft incompleto y reevaluación | Implementado: incertidumbre visible y claves por cuenta, campeón, composición y lock; se descartan respuestas antiguas. No se inventan picks ocultos. |
| 1.9 Rendimiento | Poll 400 ms en selección, debounce 150 ms y caché acotada 30 s; evaluación ligera. Falta medir CPU/latencia en League real. |
| 1.10 Vista rápida | Implementada vista resumida y detalles desplegables. |
| 1.11 Pre-game completo | Parcial: transición, runas, hechizos, iniciales, core, alternativas y plan existente. Picos de poder y matchups profundos no están certificados. |
| 1.12 Disponibilidad técnica | LCU existente de solo lectura; Riot no ofrece soporte oficial a esa interfaz para terceros. Live Client API está documentada para información local en partida. Credenciales permanecen en Rust. |
| 2.1 / 2.5 / 2.6 Compras, componentes y cartera | Implementados objetivos separados y búsqueda con presupuesto, recetas, inventario y huecos; puede conservar componentes y completar otro objetivo. El valor de cada componente sigue siendo heurístico. |
| 2.2 / 2.4 / 2.8 / 2.9 Coste, recursos y orden | Implementada evaluación de coste restante, maná, sinergias y demora; sin precio máximo arbitrario. El orden depende del estado. Falta calibrar calidad estratégica a escala completa. |
| 2.3 Economía realista | Parcial: cartera/inventario observados y baseline personal por campeón/posición cuando hay muestra; excluye intervalos con kills/assists del baseline. No separa perfectamente todas las fuentes de oro ni reconstruye consumos/ventas. |
| 2.7 Timing del oponente | Parcial: detecta un objeto terminado visible; no conoce cartera ni intención futura del rival y no proporciona una ETA rival inventada. |
| 2.10 Escenarios de validación | Hay regresiones de presupuesto, componentes, demora y opciones caras. Falta validación estratégica de todos los escenarios con partidas reales. |
| 3.1 Ciclo completo web | Parcial: draft → pregame → live → fin y enlace al historial; sincronización postpartida con reintentos. No es una transición automática integral a un informe final verificado. |
| 3.2–3.4 Acceso Live, draft y hover web | Implementados ruta privada, estado Live y proyección de draft; depende del compañero local y Share activado. |
| 3.5 Información del jugador | Parcial: identidad cuando está disponible, campeón/posición y evidencia personal existente; no garantiza mastery, rangos ni tendencias de todos los jugadores. |
| 3.6–3.8 Equipos y pregame | Parcial: vistas estructuradas y análisis existente; perfiles completos de equipos y todas las interacciones siguen pendientes. |
| 3.9–3.11 Dashboard y mismo Coach | Implementado un resultado compartido, con compras/componentes y objetivos; la web no ejecuta otro selector de objetos. |
| 3.12 Runas, habilidades, hechizos | Implementado distinguir equipados de recomendados y mostrar orden disponible. Esta revisión incorpora posición y evidencia de páginas completas. No se recalculan runas equipadas como si pudieran cambiarse durante la partida. |
| 3.13 Estrategia dinámica | Parcial: reglas y prioridades existentes; faltan curvas de poder y razonamiento estratégico exhaustivo. |
| 3.14–3.15 Más detalle sin saturar | Implementadas secciones y vistas ampliables. Ajuste visual final pendiente de prueba del usuario. |
| 3.16 Sincronización | Implementados frames del resultado mostrado, secuencia, TTL, reloj, privacidad y aislamiento de usuario/dispositivo. Cambios de posición/rival invalidan recomendaciones incompatibles. |
| 3.17 Fin de partida | Limpieza y resumen del último estado observado; análisis final depende de ingestión de Riot. No se presenta el último snapshot como resultado final oficial. |
| 3.18 Home Live | Implementado acceso visible al estado compartido; compartir debe estar activado. |

## Arquitectura y enfoque de esta revisión

1. El LCU se lee en `apps/desktop/src-tauri/src/lib.rs`; acciones pick y `completed` distinguen intención y confirmación. La revisión no añade endpoints locales ni permisos.
2. El cliente normaliza el estado y solicita el mismo motor en `apps/api/src/desktop.ts`. El resultado visible se proyecta mediante `live-relay.ts` hacia la web privada. No se accede a League desde el navegador.
3. Antes, las runas ignoraban la posición y las claves del plan en partida omitían posición/rival. Ahora ambos participan; las respuestas viejas no se reutilizan al cambiar de rol.
4. Objetos: stats, pasivas, amenazas, coste restante y demora. Faltaban mecánicas de enfriamientos no numéricos y restricciones de compra; algunas fuentes mezclaban ids reutilizados. Esas causas se corrigen en `gamedata.ts`, `profile.ts`, `capabilities.ts` y `recommend.ts`.
5. Se añade `position.ts` para normalizar TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY y aliases; no se limita un campeón a la lista de posiciones de una wiki.
6. `setup.ts` valora contexto de posición y páginas completas observadas; `stats/aggregate.ts` recoge página, shards y hechizos por matchup/posición. `build-evidence.ts` solo pasa datos de la combinación exacta y parche actual.
7. Se preserva economía observada: apoyo considera accesibilidad/utilidad sin asignarle un ingreso ficticio. Top/mid/bot pueden compartir una compra si el estado la justifica; no se fuerzan tres builds distintas.
8. No se instala ni conecta ningún proveedor nuevo. No hay cambios de dependencias, lockfile o credenciales. La implementación autorizada se limita a la rama de revisión, sin fusionar, desplegar ni publicar.
9. Orden: mapa de requisitos y diagnóstico → correcciones compartidas → corpus completo y regresiones de rol → interfaz y CI → instalador de prueba. Se requieren datos reales y validación de Windows para cerrar las brechas descritas.

## Catálogo y evidencia

Se consultó el catálogo de Riot el 28 de septiembre: versión Data Dragon **16.19.1**, **173 campeones**, los mismos 173 del snapshot existente. El barrido ejecuta los cinco roles: **865 casos**. Esto incluye posiciones poco habituales como pruebas de robustez; no significa recomendar que todos los campeones se jueguen en todos los roles.

El detalle mecánico de Meraki falta para **Locke y Zaahen**. El motor retiene sus recomendaciones de objetos/runas en vez de inventar una build a partir de una clase. Se mantiene su presencia en el catálogo y en el informe. Para los 171 restantes se generan opciones heurísticas; «full» indica disponibilidad del documento, NO certificación independiente de cada fórmula en el parche.

El informe `20-roster-audit.csv` contiene cada combinación, el rival del escenario, candidatos de objetos, botas, runas, shards, hechizos y estado de evidencia. TODOS los resultados del barrido son sin estadísticas reales adjuntas y tienen `optimality_verified=no`. No son una tabla de builds aprobadas. No se importa el CSV al motor.

Regenerar desde la raíz:

```sh
corepack pnpm --filter @coach/api exec node --import tsx ../../scripts/audit-roster.ts
```

Las observaciones del recolector interno son Master+. Se requieren al menos 100 observaciones del grupo y 30 de la opción. Las páginas deben ser legales: árboles distintos permitidos, filas válidas, dos secundarias de filas distintas y tres shards válidos. No se mezclan runas individuales tomadas de páginas diferentes. Popularidad/WR ponderados apoyan un score mecánico; no lo sustituyen por un ranking ciego de WR. Sin páginas suficientes se identifica la página como heurística.

Los nuevos contadores empiezan al ingerir partidas nuevas; no se rellenan matches ya contados. `stats=off` impide nueva recolección. Inventario actual no acredita orden histórico: los priors de compras siguen limitados al plan inicial sin un legendario terminado propio. Falta evidencia empírica suficiente para muchas combinaciones; esta revisión no afirma haberla obtenido.

## Hallazgos corregidos y límites de precisión

- Posición ausente del selector de runas y de la clave del plan en partida.
- Respuesta de objetos de otro rol visible mientras llegaba la nueva: se comprueba contexto de cuenta/campeón/posición/rival.
- Botas recomendadas a un kit que las prohíbe; mejoras gratuitas de botas tratadas como compras ordinarias.
- Id 3172: nombre actual Gunmetal Greaves unido a efectos de Zephyr antiguos. Los nombres discordantes ya no combinan documentos.
- Fórmulas de cooldown de Yasuo/Yone descartadas: ahora se conservan y su dependencia de velocidad de ataque influye en el motor.
- El detector de spell on-hit confundía la parte pasiva de Viego y los cooldowns de Bel'Veth con el caso de Smolder. Se separan esos patrones.
- Penetración mágica valorada solo por escalados AP secundarios, sin ponderar la mezcla de daño del kit. El barrido detectó botas inapropiadas para Smolder.
- Las conversiones explícitas de crítico y de vida se reconocen como mecánicas; no se añaden listas de builds por nombre.

Quedan modelos aproximados: proporciones de daño, valor de pasivas complejas, transformaciones, interacción exacta entre habilidades, orden posterior de compras, runas óptimas y picos de nivel/objetos. El análisis automático de texto no sustituye validación especializada ni partidas. Los pesos de posición son heurísticos y no demuestran optimalidad.

## Fuentes consultadas

- https://ddragon.leagueoflegends.com/api/versions.json
- https://ddragon.leagueoflegends.com/cdn/16.19.1/data/en_US/champion.json
- https://developer.riotgames.com/docs/lol
- https://developer.riotgames.com/policies/general
- Referencias externas separadas para Yasuo: https://mobalytics.gg/lol/champions/yasuo/build/top , https://mobalytics.gg/lol/champions/yasuo/build/mid , https://mobalytics.gg/lol/champions/yasuo/build/adc . Sirven de contraste por posición, no de dataset importado ni de validación completa por matchup.

LCU no cuenta con soporte oficial para aplicaciones de terceros. El producto debe declarar sus endpoints/uso ante Riot; no se afirma aprobación de Riot por acceder técnicamente a los datos. No se añaden lectura de memoria, inyección, extracción de identidades ocultas ni automatización de compras/decisiones del jugador.
