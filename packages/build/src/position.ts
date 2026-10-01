/** Client aliases have one canonical key throughout evidence, build and setup decisions. */
export const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
export type Position = typeof POSITIONS[number];
export function normalizePosition(value?: string | null): Position | null {
  const key = (value ?? '').trim().toUpperCase();
  const aliases: Record<string, Position> = { MID: 'MIDDLE', BOT: 'BOTTOM', ADC: 'BOTTOM', SUPPORT: 'UTILITY', SUP: 'UTILITY' };
  return aliases[key] ?? (POSITIONS.includes(key as Position) ? key as Position : null);
}
export function positionReason(position: Position | null): string {
  switch (position) {
    case 'TOP': return 'Top: evaluate the solo-lane matchup and sustained trades; use top-only observations.';
    case 'JUNGLE': return 'Jungle: prioritize camp access and map movement; repeated lane-trading effects have fewer opportunities.';
    case 'MIDDLE': return 'Mid: evaluate the lane matchup, ability trades and movement between lanes.';
    case 'BOTTOM': return 'Bot carry: evaluate farming, repeated damage and survival in a shared lane; bot is not restricted to marksmen.';
    case 'UTILITY': return 'Support: evaluate allied utility and recipe cost without assuming farming income.';
    default: return 'Position unknown: no role-specific statistics or income assumptions are applied.';
  }
}
