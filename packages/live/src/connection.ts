/** A brief read failure is not a match end. Hide advice while reconnecting. */
export const CONNECTION_GRACE_MS = 30_000;
export class ConnectionHealth {
  private failedAt: number | null = null;
  observe(ok: boolean, now: number): "fresh" | "reconnecting" | "ended" {
    if (ok) { this.failedAt = null; return "fresh"; }
    this.failedAt ??= now;
    return now - this.failedAt >= CONNECTION_GRACE_MS ? "ended" : "reconnecting";
  }
}
