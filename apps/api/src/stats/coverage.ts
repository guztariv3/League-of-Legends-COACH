import { POSITIONS } from '@coach/build';

export interface CoverageCount {
  patch: string; champion: string; position: string; kind: string; key: string; games: number; wins: number;
}
const kinds = ['first_item', 'rune_page', 'spells'] as const;
/** Sample availability only: legality, mechanics and strategic quality need separate checks. */
export function coverageReport(rows: CoverageCount[], champions: string[], patch: string) {
  const current = rows.filter(r => r.patch === patch && Number.isInteger(r.games) && r.games >= 0 &&
    Number.isInteger(r.wins) && r.wins >= 0 && r.wins <= r.games);
  const sample = (rs: CoverageCount[]) => {
    // Engine baselines include rare options; only supported options may affect a ranking.
    const observations = rs.reduce((n, r) => n + r.games, 0);
    const supportedOptions = rs.filter(r => r.games >= 30).length;
    return { observations, supportedOptions, sampleThresholdMet: observations >= 100 && supportedOptions > 0 };
  };
  return champions.flatMap(champion => POSITIONS.map(position => {
    const group = current.filter(r => r.champion === champion && r.position === position);
    const games = group.find(r => r.kind === 'games' && r.key === '')?.games ?? 0;
    const general = Object.fromEntries(kinds.map(kind => [kind, sample(group.filter(r => r.kind === kind))]));
    const opponents = [...new Set(group.filter(r => r.kind.startsWith('matchup_') && r.key.includes('|'))
      .map(r => r.key.split('|')[0]!))].sort();
    const matchups = opponents.map(opponent => ({ opponent, byKind: Object.fromEntries(kinds.map(kind =>
      [kind, sample(group.filter(r => r.kind === `matchup_${kind}` && r.key.startsWith(`${opponent}|`)))])) }));
    return { champion, position, games, displayThresholdMet: games >= 30, general, matchups,
      optimalityVerified: false as const };
  }));
}
