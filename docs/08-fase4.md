# Fase 4 · Live Coach (escritorio)

Estado: **compila y se ha probado con partidas simuladas**. Este entorno no tiene League instalado, así que la lectura real de la API local del juego queda pendiente de probar en un PC con Windows o macOS.

## Qué existe

| Área | Implementación | Dónde |
|---|---|---|
| App de escritorio | Tauri v2: una ventana lateral independiente de 380×560, siempre encima, sin dibujar nada dentro del juego. Compila sin avisos en Linux (debug) y se ha comprobado que arranca bajo Xvfb. | `apps/desktop` |
| Lectura del juego | La parte en Rust hace un GET de solo lectura a `https://127.0.0.1:2999/liveclientdata/allgamedata`, la API que publica el propio juego, con timeouts cortos (400 ms de conexión y 900 ms en total). Hay un test que comprueba que falla rápido si no hay partida. | `src-tauri/src/lib.rs` |
| Game State central | Construido solo con lo que expone esa API: nivel, KDA, CS, objetos, posición declarada y eventos. No modela nada que no sea observable: ni cooldowns rivales, ni posiciones en el mapa, ni intenciones. | `packages/live/src/state.ts` |
| Event intelligence | Tus picos de poder (niveles 6/11/16 y objetos grandes), picos de tu rival de línea (nivel 6 y objetos; el propio marcador del juego los muestra). En modos sin líneas (ARAM, ARAM Mayhem, Arena…) no hay rival de línea: se avisa del rival con más objetos grandes completados, solo si es único. También: objetivos conseguidos y progreso de tu enfoque (CS/min). | `signals.ts` |
| Modo de juego | La ventana muestra el modo y el mapa que informa el juego (p. ej. "ARAM · Abismo de los Lamentos"). Los modos sin nombre conocido se muestran con el código del propio juego, sin inventar un nombre. | `state.ts` (`modeInfo`) |
| Policy / Safety engine | Lista blanca de categorías y lista negra explícita: órdenes, definitivas rivales, hechizos de invocador rivales, predicción de intenciones, timers de objetivos y acceso a memoria o procesos. Además tiene un filtro de lenguaje imperativo ("ve", "gankea", "go", "buy"…). Lo bloqueado se registra internamente. | `policy.ts` |
| Notificaciones | Como mucho un mensaje por actualización y separación mínima según intensidad (baja 90 s, normal 40 s, alta 20 s). Lo informativo nunca se encola. Lo importante espera a que termine una pelea (se detecta pelea con 2 o más kills en 15 s). Todo aviso con más de 60 s se descarta. | `notifier.ts` |
| Modo Enfoque | Manual o automático (en peleas y en Modo seguro): solo lo importante, sin animaciones y en formato compacto. | idem |
| Modo seguro | Con CPU ≥ 85 % o menos del 10 % de memoria libre: la consulta pasa de cada 2 s a cada 6 s, solo muestra lo importante y quita animaciones. Se restaura tras 6 muestras tranquilas seguidas. | `safe-mode.ts` + comando `system_load` |
| Controles | Pausar, silenciar, Enfoque, ocultar (minimizar), intensidad y qué categorías pueden avisar. Se recuerdan localmente. | `apps/desktop/src/main.tsx` |
| Demostración | Reproduce una partida sintética "como si fuera en vivo" para probar el Coach sin League. Siempre aparece etiquetada. Se carga solo cuando se pide, para que la ventana siga ligera. | `demo.ts`, `simulator.ts` |
| Diseño compartido | El avatar y los tokens de diseño viven en `packages/ui` y los usan la web y el escritorio (sección 112). | `packages/ui` |

### Panel de partida (sin conexión)

Durante la partida, la ventana muestra lo mismo que el marcador del juego (Tab), leído de la Live Client Data API:
- **Rivales** y **Tu equipo**: retrato, nivel, KDA, CS y los 7 huecos de objetos de cada jugador.
- Imágenes de Data Dragon (`rawChampionName` → id del campeón, `itemID` → objeto). Sin red, se muestran iniciales.
- No añade información oculta. Los objetos rivales los enseña el propio juego. Nada de cooldowns ni de hechizos rivales.

**Tu build** (decisión del usuario: *solo tu historial*):
- Muestra los objetos grandes (≥ 2200 de oro, más las botas de nivel 2) con los que terminaste tus partidas con ese campeón en ese modo.
- Cada objeto indica en cuántas partidas lo terminaste y su % de victorias, y marca los que ya llevas.
- Necesita al menos 3 partidas con el campeón, y cada objeto debe aparecer en al menos 2.
- Sale de `GET /api/desktop/build` con el token del dispositivo. Nunca es una orden, ni sale de otros jugadores o de la meta.

### Rivales en la pantalla de carga (conexión con la web)

La ventana puede mostrar a tus rivales (Riot ID, rango, % de victorias y 3 mejores campeones) en cuanto empieza la pantalla de carga. Lee el mismo análisis que la web ("Antes de jugar"); no toca el cliente ni el juego. En el lobby o la selección de campeones no es posible: Riot oculta a los rivales hasta la pantalla de carga (D-03).

Seguridad de la conexión (decisión del usuario: **código de conexión**):

1. En la web, **Ajustes → App de escritorio → Generar código**: un código `XXXX-XXXX` de un solo uso que caduca en 10 minutos.
2. En la app, botón **Conectar** de la pantalla principal (fuera de partida): la dirección de la web y el código. La app lo cambia por un token de dispositivo (`POST /api/desktop/claim`).
3. Con `Authorization: Bearer <token>` la app **solo** puede leer `GET /api/desktop/scout` y `GET /api/desktop/build`. No abre ninguna otra ruta ni la sesión web.

- En la base de datos solo se guardan hashes SHA-256 del código y del token (`device_links`).
- La app nunca ve ni guarda la contraseña del prototipo. Esas dos rutas son las únicas que el gate deja pasar, porque llevan su propia autenticación.
- Hay límite de intentos del código: 10 por minuto por IP (la que añade el proxy, no la que manda el cliente) y 60 por minuto en total.
- Desde la web se ve cada app conectada (último uso) y se puede **desconectar**; el token deja de valer al momento.
- La parte en Rust solo acepta `https://` (o `http://` a esta misma máquina, para desarrollo) y comprueba el certificado con normalidad.
- La app consulta cada 30 s mientras espera, deja de consultar cuando ya conoce a los rivales y empieza de nuevo al terminar la partida. El servidor cachea el análisis 90 s.

Durante la partida el Live Coach no usa IA ni Internet (la lista de rivales ya se ha descargado en la pantalla de carga): los precios y nombres de los objetos vienen en los propios datos del juego (sección 88).

## Compatibilidad con Riot y Vanguard

- La app solo hace peticiones HTTPS de solo lectura a la API local oficial del juego. No lee memoria, no inyecta código, no dibuja overlays dentro del juego, no automatiza entradas y no toca procesos ni archivos protegidos.
- El certificado local del juego lo firma la raíz de Riot, que no está en el almacén del sistema. Por eso ese único cliente acepta certificados no válidos, y solo lo usa para la URL fija de 127.0.0.1. **Pendiente:** fijar el `riotgames.pem` publicado por Riot cuando se pueda verificar (su portal está bloqueado desde este entorno).
- La LCU (cliente de League) **no** se usa todavía. Integrar la selección de campeones requiere registrar ese uso ante Riot y respetar el anonimato (D-03); de momento el draft se prepara a mano en la web.

## Actualizaciones (secciones 108–109)

Diseño previsto, **no activado** porque depende de D-08 (hosting) y de una clave de firma:

1. **Actualizar:** plugin oficial `tauri-plugin-updater`, con el manifiesto servido desde el hosting que se elija.
2. **Validar:** cada paquete va firmado. La clave privada se guarda como secreto de CI y nunca en el repositorio; la app lleva solo la clave pública y rechaza paquetes con firma inválida.
3. **Activar:** el instalador reemplaza la versión solo si descarga y firma son correctos. Si falla, se conserva la versión instalada y se informa.
4. **Rollback:** el updater de Tauri no tiene rollback automático. Se hará publicando de nuevo la versión estable anterior en el manifiesto, y se documentará en el runbook de despliegue.

El conocimiento del juego ya se actualiza con validación y rollback en el servidor (Fases 1 y 3).

## Simplificaciones (sección 3)

| Cambio | Por qué | Qué se conserva |
|---|---|---|
| Sin timers de objetivos en vivo | La política no está verificada (D-02, criterio conservador). | Aviso cuando se consigue un objetivo (desactivado por defecto). |
| Sin hotkeys globales ni icono en la bandeja | Cada integración del sistema operativo es más superficie y más permisos; los controles de la ventana bastan por ahora. | Ocultar, pausar y silenciar. |
| El enfoque se elige en la ventana, no se sincroniza con la web | La app de escritorio aún no tiene sesión con la API (pendiente de RSO, D-01). | Se sincronizará cuando exista el inicio de sesión real. |
| Sin LLM en vivo | Latencia, coste y riesgo; el brief lo prioriza así (secciones 87–88). | Mensajes deterministas a partir de plantillas. |

## Quality gate

- Typecheck en verde, 103 tests unitarios y de integración, 6 E2E web, 1 E2E de la ventana de escritorio y 1 test de Rust.
- `cargo build` sin avisos. La app arranca bajo Xvfb y sigue viva a los 10 s.
- Revisión de código con la skill `code-review`: 3 bugs corregidos con tests. Se podían perder avisos importantes de la misma actualización; una segunda partida en la misma sesión quedaba casi muda; y los objetivos anteriores al arranque se anunciaban como nuevos.
- Seguridad (manual): permisos mínimos (`core:default`, minimizar, siempre encima), CSP restrictiva, sin plugins de shell ni de sistema de archivos, y la excepción de certificado limitada a la URL local fija.
- Revisión visual: se corrigió la burbuja del Coach, que tapaba la barra de controles con los ajustes abiertos.

## Cómo probar

```bash
pnpm test:e2e:desktop                     # UI en modo demostración (navegador)
cd apps/desktop && pnpm tauri dev         # app real (necesita las dependencias de Tauri del sistema)
```
En Windows o macOS, con una partida en curso, la ventana pasa sola de "Esperando partida" a "En partida".
