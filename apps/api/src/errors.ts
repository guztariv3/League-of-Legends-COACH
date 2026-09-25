import { RiotApiError } from "@coach/riot";

/** What the player sees when a Riot call fails; the raw error stays in the server log. */
const RIOT_MESSAGES: Record<RiotApiError["kind"], { status: 502 | 503; message: string }> = {
  auth: { status: 503, message: "Riot ha rechazado la clave de la API (no es válida o ha caducado). Hay que renovarla en el servidor." },
  rate_limited: { status: 503, message: "Riot está limitando las peticiones. Espera un minuto y vuelve a intentarlo." },
  server: { status: 502, message: "Los servidores de Riot no responden ahora mismo. Inténtalo de nuevo en unos minutos." },
  schema: { status: 502, message: "Riot ha respondido con datos que no esperábamos. Ya queda registrado para revisarlo." },
  bad_request: { status: 502, message: "Riot no ha aceptado la petición. Ya queda registrado para revisarlo." },
  not_found: { status: 502, message: "Riot no ha encontrado los datos pedidos." },
};

export function riotFailure(err: unknown): { status: 502 | 503; message: string } | null {
  return err instanceof RiotApiError ? RIOT_MESSAGES[err.kind] : null;
}
