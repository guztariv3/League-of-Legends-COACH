# Fase 0 · Investigación (Riot, datos, políticas)

**Nivel de verificación**
- **V1** = extracto de página oficial de Riot obtenido vía búsqueda (la página completa no se pudo abrir por la red del entorno).
- **V2** = fuente secundaria (prensa, docs comunitarias, librerías). Debe confirmarse en el portal oficial antes de depender de ello en producción.
- **NV** = no verificado. No se implementa sin verificación.

> Antes de salir a producción hay que releer completas las políticas oficiales (General + League of Legends), ya que Riot las cambia con frecuencia (p. ej. marzo y mayo de 2025).

## 1. Acceso a la API y autenticación

| Hecho | Nivel | Fuente |
|---|---|---|
| Hay 3 tipos de key: **Development** (prototipos; caduca cada 24 h; no se puede mantener un producto público con ella), **Personal** (solo el desarrollador o una comunidad privada pequeña; sin aumento de rate limit) y **Production** (productos públicos). | V1 | developer.riotgames.com/docs/portal |
| Rate limit de la key Development: 20 req/1 s y 100 req/2 min, **por región de routing**. Los límites reales se leen de las cabeceras de respuesta, y un 429 incluye `Retry-After`. | V1/V2 | portal; hextechdocs.dev/rate-limiting |
| **RSO (Riot Sign On) solo está disponible para apps con Production key aprobada.** Las apps de producción recién aprobadas reciben después una invitación para solicitar RSO. | V1 | support-developer.riotgames.com (artículo RSO, OAuth Client Documentation) |
| La Production key requiere un sitio o prototipo funcional que demuestre el caso de uso. | V1 | artículo Production Key Applications |
| Para monetizar hace falta un producto registrado (Approved/Acknowledged), un tier gratuito y contenido transformativo. | V1 | políticas generales |
| Es obligatorio el disclaimer "Legal Jibber Jabber": el proyecto no está respaldado ni patrocinado por Riot. | V1 | riotgames.com/en/legal |

**Impacto:** el brief exige "solo Riot como autenticación", pero RSO no es obtenible hasta tener un prototipo aprobado. Ver decisión D-01 en `04-decisiones.md`.

## 2. Endpoints relevantes (PUUID como identificador canónico)

| Endpoint | Uso | Nivel |
|---|---|---|
| `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` (routing regional) | Riot ID → PUUID | V1 |
| `GET /riot/account/v1/accounts/by-puuid/{puuid}` | PUUID → Riot ID | V1 |
| `GET /lol/summoner/v4/summoners/by-puuid/{puuid}` (plataforma) | Datos del invocador | V1 |
| league-v4 (entradas de rango) | Rango. **Hay que confirmar la variante by-puuid** en el portal. | V2 |
| match-v5: IDs por PUUID, partida por ID y **timeline** por ID | Historial, análisis y reconstrucción | V1 |
| spectator-v5 (partida activa) | Scouting desde la pantalla de carga. **Confirmar la ruta exacta.** | NV |

- **Routing:** existen rutas de plataforma (euw1, na1, kr…) y rutas regionales (americas, europe, asia, sea). match-v5 y account-v1 usan la regional. El mapeo completo se tomará del portal.
- **Timeline de match-v5:** `frameInterval` (≈60 s) con `participantFrames` (oro, nivel, xp, CS y posición por minuto) más eventos con timestamp (kills, objetivos, compras, level-ups, wards…). (V2)
- **Replays (.rofl):** no hay API oficial ni un parser soportado. **El "Replay" del producto será una reconstrucción a partir del timeline** (posiciones con resolución de ~1 min y eventos exactos), no un vídeo ni una reproducción de movimiento continuo.

## 3. Datos locales durante la partida

| Fuente | Qué ofrece | Estado | Nivel |
|---|---|---|---|
| **Live Client Data API** `https://127.0.0.1:2999/liveclientdata/*` (`allgamedata`, `activeplayer`, `playerlist`, `eventdata`…) | Datos del jugador activo (stats, runas, oro) y datos visibles de todos los jugadores (campeón, nivel, items, KDA, hechizos). Lo expone el propio juego durante la partida. | API oficial documentada por Riot | V1/V2 |
| **LCU (League Client)** vía el fichero `lockfile` | Sesión de champ select, eventos del cliente | Riot pide registrar el uso de la LCU en el portal; solo se permiten ciertos endpoints | V2 |
| Lectura de memoria, inyección, hooks del juego | — | **Prohibido** y incompatible con Vanguard | V1/V2 |

La Live Client Data API no expone cooldowns de habilidades enemigas ni posiciones. **No existe un "Game State completo" observable en vivo.** El Game State live se limita a lo que expone esa API.

## 4. Políticas de juego que afectan al producto (League of Legends)

| Regla | Nivel | Impacto en el brief |
|---|---|---|
| Se prohíben las notificaciones que **dictan acciones según el estado actual** (ejemplo oficial: "Enemy champion is underleveled, go gank top lane"). Se permiten avisos de power spike ("X hit level 6"). Los productos no deben eliminar decisiones, pero **pueden destacar decisiones importantes ofreciendo varias opciones**. | V1 | Secciones 30–35 y 110 en live: el Live Coach **informa y ofrece opciones**; nunca ordena. |
| **Tracking de la ulti enemiga prohibido** (automático o manual), desde marzo de 2025. | V1/V2 | No se implementa. |
| Tracking de cooldowns de summoners enemigos: las fuentes se contradicen (algunas dicen que los timers estándar están permitidos y otras lo listan como prohibido). | V2 (conflicto) | **No se implementa** (criterio conservador). |
| Timers de campamentos de jungla y objetivos estándar | V2 | Solo si se confirma en la política oficial. |
| **Anonimato en champ select** (ranked Solo/Duo): no des-anonimizar a jugadores ajenos a tu party. Los nombres son visibles desde la pantalla de carga. Se prohíben las funciones que faciliten el dodge. | V1/V2 | El **scouting enemigo empieza en la pantalla de carga**, nunca en el draft. El draft usa solo campeones. |
| Sin publicidad in-game ni en overlays (desde mayo de 2025) | V2 | Encaja: no hay monetización. |
| No crear MMR alternativo ni rankings artificiales | V2 | Encaja con "sin overall score". |
| Los productos deben aumentar la diversidad de decisiones (builds, composiciones) | V1 | Encaja con "no recomendar por popularidad/winrate". |

## 5. Datos estáticos

- **Data Dragon**: `versions.json` y datos por versión (campeones, items, runas, iconos). Es la fuente oficial versionada; encaja con "todo conocimiento asociado a una versión". (V2, no se pudo probar desde aquí)
- **Limitación conocida (V2):** los tooltips y valores de habilidades en Data Dragon están incompletos para muchos campeones. **CommunityDragon** tiene datos más completos, pero es **no oficial**. Consecuencia: el Combat Engine con daños exactos no es fiable al inicio (decisión D-06).
- **Patch notes**: no hay una API oficial de patch notes conocida (NV). El pipeline de parche se basará en diffs versionados de Data Dragon, no en parsear texto.

## 6. IA (verificado con la skill `claude-api`, caché de 2026-06-24)

- Modelos actuales de Anthropic: `claude-opus-5` (por defecto), `claude-sonnet-5` y `claude-haiku-4-5` (el más barato y rápido), entre otros.
- Hay prompt caching (prefijo estable: system + conocimiento del parche) y structured outputs (`output_config.format`) para que el LLM **explique** hechos estructurados en vez de inventarlos.
- La elección de modelo por coste es decisión del usuario (D-07).

## 7. Desktop

- **Tauri v2** (Rust + WebView del sistema) vs **Electron**: Tauri tiene un consumo de RAM y disco mucho menor, lo que encaja con la prioridad de rendimiento del Live Coach (sección 24). Además permite reutilizar la misma UI React de la web. (V2)
