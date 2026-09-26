# Registro del uso de la LCU ante Riot (D-13)

La política de Riot para la API del cliente (LCU) pide avisar antes de publicar una app que la use y limitarse a los endpoints aprobados. Lo hace el dueño de la app en el Developer Portal (developer.riotgames.com → su app → descripción del producto), o por el canal de Developer Relations. Texto preparado (en inglés, como lo pide Riot):

---

**Product:** KOI Master — a free League of Legends coach (website + Windows desktop app).

**LCU usage (read-only):** During champion select, the desktop app reads the local League Client API to show the player a pre-game plan for their own champion and the champions picked in their game.

- Endpoints: `GET /lol-gameflow/v1/gameflow-phase` and `GET /lol-champ-select/v1/session`, plus the WebSocket event for `/lol-champ-select/v1/session`.
- Read-only: no writes of any kind (no rune pages, item sets, picks, bans or chat).
- Anonymity: nothing about other players is shown or looked up during champion select. From the session it only uses champion ids; summoner names/PUUIDs of other players are ignored. Player scouting starts at the loading screen through spectator-v5, as today.
- No dodge-assist features, no MMR/ELO estimates, no ads, not offered in Korea.
- In game it only reads the Live Client Data API (127.0.0.1:2999). No memory reading, injection or game-file changes.
- Includes Riot's "isn't endorsed by Riot Games" notice.

---

Cuando esté enviado, se implementa F3b: lectura del `lockfile` del cliente, conexión local con el certificado raíz de Riot, y el plan de partida se muestra en cuanto se eligen los campeones.
