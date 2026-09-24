import { Notifier, type Delivery, type LiveControls } from "./notifier.js";
import { SafeModeController, type LoadSample } from "./safe-mode.js";
import { AllGameData } from "./schema.js";
import { detectSignals, type SignalConfig } from "./signals.js";
import { emptyState, reduceState, type GameState } from "./state.js";

/**
 * The Live Coach loop, off the game's critical path: snapshot → Game State
 * → signals → policy/anti-spam/focus → at most one message. It is
 * deterministic, uses no network or LLM, and uses only data already loaded
 * (brief §88).
 */
export interface EngineTick {
  state: GameState;
  deliveries: Delivery[];
  safeMode: boolean;
  safeModeReason: string | null;
  pollMs: number;
  /** Set when the snapshot could not be understood; the Coach degrades silently. */
  degraded: string | null;
}

export class LiveEngine {
  private state: GameState = emptyState();
  private readonly notifier = new Notifier();
  readonly safeMode = new SafeModeController();

  constructor(private readonly cfg: SignalConfig) {}

  get policyLog() {
    return this.notifier.policy.log;
  }

  /** Item prices and names come with the live data itself, so no network is needed during the game. */
  private learnItems(data: AllGameData): void {
    this.cfg.itemPrices ??= new Map();
    this.cfg.itemNames ??= new Map();
    for (const p of data.allPlayers) {
      for (const i of p.items) {
        if (i.price !== undefined && !this.cfg.itemPrices.has(i.itemID)) this.cfg.itemPrices.set(i.itemID, i.price);
        if (i.displayName && !this.cfg.itemNames.has(i.itemID)) this.cfg.itemNames.set(i.itemID, i.displayName);
      }
    }
  }

  reset(): void {
    this.state = emptyState();
    this.notifier.reset();
  }

  tick(raw: unknown, controls: LiveControls, load: LoadSample | null): EngineTick {
    const safe = this.safeMode.update(load);
    const base = { safeMode: safe, safeModeReason: this.safeMode.reason, pollMs: this.safeMode.pollMs };
    const parsed = AllGameData.safeParse(raw);
    if (!parsed.success) return { state: this.state, deliveries: [], degraded: "unexpected_live_data", ...base };
    // A new game (clock went backwards): start from a clean state.
    if (parsed.data.gameData.gameTime + 5 < this.state.time) this.reset();
    this.learnItems(parsed.data);
    const next = reduceState(this.state, parsed.data, { itemPrices: this.cfg.itemPrices });
    const signals = controls.paused ? [] : detectSignals(this.state, next, this.cfg);
    const deliveries = this.notifier.process(signals, next, controls, safe);
    this.state = next;
    return { state: next, deliveries, degraded: next.complete ? null : "incomplete_live_data", ...base };
  }
}
