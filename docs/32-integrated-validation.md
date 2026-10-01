# Revisión integrada — 29 de septiembre de 2026

## Resultado

Código de ejecución: `2b8d195bff54e292e2c4c5f44d8ba37d43748306`, PR #51 en borrador. Se comprobó que el checkout coincidía con el head del PR antes de añadir esta revisión. No se cambió el comportamiento del programa, no se fusionó ni desplegó en Render, y no se ejecutó recuperación histórica.

La revisión automatizada disponible aquí está aprobada. **La validación integral con League instalado sigue pendiente.** Tampoco se certifica que cada recomendación estratégica sea óptima.

## Comprobaciones ejecutadas de nuevo

| Área | Resultado y alcance |
|---|---|
| TypeScript | Aprobado, incluido el nuevo test web. |
| Lógica, API y persistencia de prueba | 842 pruebas aprobadas; una omitida porque requiere PostgreSQL externo de pruebas. 64 archivos. Incluye invariantes del catálogo y roles, no validación estratégica manual de 865 builds. |
| Interfaz web | 20 pruebas aprobadas: 10 en escritorio y 10 en emulación Pixel 7. Incluye cuentas, perfil, historial, filtros, draft manual, Live y páginas públicas. |
| Interfaz de escritorio | 21 pruebas aprobadas en Chromium con puente Tauri/League simulado: selección, respuestas atrasadas, cambio de rol, compras, Share, reloj, overlay y fin/nueva partida. No ejecuta el binario Windows. |
| Compilación web/escritorio | Ambas builds Vite aprobadas. No se recompiló Rust localmente. |
| Revisión visual | Inspección de capturas de compras del escritorio y Live web. Los iconos de las pruebas usan imágenes simuladas/fallbacks; no acredita la carga de imágenes reales en Windows. |
| CI del código de ejecución | GitHub CI y Desktop test build de `2b8d195` aprobados; runs 36571538685 y 36571538724. No atribuir esos resultados al commit posterior de pruebas/documentación. |

El primer intento de suite local con concurrencia predeterminada tuvo 841 aprobadas, una omitida y un timeout de 5 segundos en la prueba del crawler. La suite completa repetida con `--maxWorkers=2` aprobó las 842 sin modificar aserciones ni ampliar timeouts. Esto es compatible con contención del entorno; no demuestra por sí solo la causa del timeout. Las primeras ejecuciones E2E no pudieron arrancar porque faltaba Chromium. Después de instalarlo, ambas suites terminaron correctamente.

## Cobertura añadida: servidor real entre productor y web

`apps/web/e2e/live-server.spec.ts` no intercepta `/api/live`. Arranca la API y su base PGlite aislada de prueba mediante la configuración existente y usa HTTP real, autenticación real de desarrollo, código de enlace, token del dispositivo y polling del navegador.

Comprueba en escritorio y móvil:

- Enlace y entrega de estados draft → pregame → live a la cuenta correcta; una segunda cuenta no recibe el contenido.
- Rechazo de secuencias atrasadas y capturas antiguas, preservando el estado aceptado.
- Ocultación de consejos en paused/reconnecting, enlace al historial al terminar y limpieza al enviar idle.
- Nueva publicación, revocación desde la cuenta, desaparición en la web y rechazo del token revocado.

El productor de los mensajes sigue siendo una fixture del test. Esta prueba cierra la brecha HTTP/base/web, pero **no conecta la app nativa a League**, no simula un corte de red real y no evalúa la calidad de una recomendación. Las pruebas anteriores de web Live interceptaban la respuesta y las de escritorio simulaban el puente; siguen siendo útiles para sus respectivos límites.

## Pendientes que requieren otra evidencia

1. Windows: instalar el artefacto fijado, conectar app y API/web del mismo SHA, verificar lecturas reales de selección/partida, Share, desconexión, recuperación, fin/nueva partida y CPU/latencia. Guía actual: `33-windows-integrated-test.md`.
2. Estrategia: registrar estados reales con campeón, rol, rival, oro e inventario; revisar decisiones individualmente. Las ponderaciones y escenarios automatizados no prueban optimalidad ni ausencia de interferencia durante League.
3. Datos: siguen vigentes las muestras insuficientes y categorías ausentes documentadas en `30-current-status-and-handoff.md` y `31-missing-statistics-plan.md`. No se recuperaron ni añadieron estadísticas en esta revisión.
4. Contenido: Locke y Zaahen continúan sin mecánicas detalladas suficientes en la fuente incluida; perfiles exhaustivos, curvas de poder y economía futura rival permanecen parciales.

## Reproducción

Usar Node >=22 y pnpm 10.33.0 del proyecto. No utilizar bases o credenciales de Render.

```sh
pnpm typecheck
pnpm test --maxWorkers=2
pnpm --filter @coach/web exec playwright install chromium
pnpm --filter @coach/web e2e --workers=2
pnpm --filter @coach/desktop e2e --workers=2
pnpm --filter @coach/web build
pnpm --filter @coach/desktop build
```

Las pruebas E2E usan datos sintéticos y una base de pruebas nueva. No rebajar umbrales estadísticos ni habilitar el crawler/backfill para hacer pasar esta revisión. El resultado autoriza continuar la validación; no es una certificación de publicación.
