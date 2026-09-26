import { RiotApiError } from "@coach/riot";

/** What the player sees when a Riot call fails; the raw error stays in the server log. */
const RIOT_MESSAGES: Record<RiotApiError["kind"], { status: 502 | 503; message: string }> = {
  auth: { status: 503, message: "Riot rejected the API key (invalid or expired). It needs to be renewed on the server." },
  rate_limited: { status: 503, message: "Riot is rate-limiting requests. Wait a minute and try again." },
  server: { status: 502, message: "Riot's servers are not responding right now. Try again in a few minutes." },
  schema: { status: 502, message: "Riot answered with data we did not expect. It has been logged for review." },
  bad_request: { status: 502, message: "Riot did not accept the request. It has been logged for review." },
  not_found: { status: 502, message: "Riot could not find the requested data." },
};

export function riotFailure(err: unknown): { status: 502 | 503; message: string } | null {
  return err instanceof RiotApiError ? RIOT_MESSAGES[err.kind] : null;
}
