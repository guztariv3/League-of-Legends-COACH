/**
 * Safe Mode (brief §24, §90): the game always has priority. When the machine
 * is under pressure the Coach polls less, drops animations and only keeps
 * important messages. It restores itself after a sustained calm period.
 */

export interface LoadSample {
  /** Total CPU usage 0..100. */
  cpu: number;
  /** Available memory as a fraction 0..1. */
  memAvailable: number;
}

export interface SafeModeConfig {
  cpuHigh: number;
  memLow: number;
  /** Consecutive calm samples needed to leave Safe Mode. */
  calmSamples: number;
  normalPollMs: number;
  safePollMs: number;
}

export const DEFAULT_SAFE_MODE: SafeModeConfig = { cpuHigh: 85, memLow: 0.1, calmSamples: 6, normalPollMs: 2000, safePollMs: 6000 };

export class SafeModeController {
  private active = false;
  private calm = 0;
  reason: string | null = null;

  constructor(private readonly cfg: SafeModeConfig = DEFAULT_SAFE_MODE) {}

  get isActive(): boolean {
    return this.active;
  }

  get pollMs(): number {
    return this.active ? this.cfg.safePollMs : this.cfg.normalPollMs;
  }

  update(s: LoadSample | null): boolean {
    if (!s) return this.active; // no measurement: keep the current mode
    const pressure = s.cpu >= this.cfg.cpuHigh ? "cpu" : s.memAvailable <= this.cfg.memLow ? "memory" : null;
    if (pressure) {
      this.active = true;
      this.calm = 0;
      this.reason = pressure;
    } else if (this.active && ++this.calm >= this.cfg.calmSamples) {
      this.active = false;
      this.reason = null;
    }
    return this.active;
  }
}
