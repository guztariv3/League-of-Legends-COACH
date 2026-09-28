/** Observational purchase evidence, not a causal estimate or a predicted win probability. */
export interface PurchaseObservation { key: string; games: number; wins: number }
export interface BuildEvidence {
  champion: string; position: string; patch: string;
  first: PurchaseObservation[]; core: PurchaseObservation[]; runePages?: PurchaseObservation[]; spells?: PurchaseObservation[];
  matchup?: { opponent: string; first: PurchaseObservation[]; core: PurchaseObservation[]; runePages?: PurchaseObservation[]; spells?: PurchaseObservation[] };
}
export interface PurchasePrior { bonus:number; reason:string }

export function purchasePrior(input: {
  evidence?:BuildEvidence; champion:string; position?:string|null; patch?:string;
  opponent?:string|null; chosen:number[]; candidate:number;
}): PurchasePrior | null {
  const e=input.evidence;
  if (!e || !input.position || !input.patch || e.champion!==input.champion || e.position!==input.position || e.patch!==input.patch) return null;
  const valid=(rows:PurchaseObservation[])=>rows.filter(r=>Number.isInteger(r.games)&&r.games>=0&&Number.isInteger(r.wins)&&r.wins>=0&&r.wins<=r.games&&/^\d+(>\d+)*$/.test(r.key));
  const options=(rows:PurchaseObservation[])=>{
    const counts=new Map<number,{games:number;wins:number}>();
    for(const r of valid(rows)){
      const ids=r.key.split('>').map(Number);
      if(input.chosen.some((id,i)=>ids[i]!==id))continue;
      const id=ids[input.chosen.length];if(!id)continue;
      const c=counts.get(id)??{games:0,wins:0};c.games+=r.games;c.wins+=r.wins;counts.set(id,c);
    }
    return counts;
  };
  const general=options(input.chosen.length ? e.core : e.first);
  const match=e.matchup && e.matchup.opponent===input.opponent ? options(input.chosen.length ? e.matchup.core : e.matchup.first) : new Map<number,{games:number;wins:number}>();
  const total=(m:typeof general)=>[...m.values()].reduce((n,r)=>n+r.games,0);
  // Sparse matchup slices cannot displace a better supported champion/role baseline.
  const scoped=total(match)>=100 && (match.get(input.candidate)?.games??0)>=30;
  const pool=scoped?match:general,n=total(pool),row=pool.get(input.candidate);
  if(n<100 || !row || row.games<30)return null;
  const wins=[...pool.values()].reduce((s,r)=>s+r.wins,0);
  const baseline=wins/n;
  const shrunk=(row.wins+100*baseline)/(row.games+100);
  const support=row.games/(row.games+100);
  const popularity=Math.sqrt(row.games/n);
  const advantage=Math.max(-.1,Math.min(.1,shrunk-baseline));
  const bonus=support*(.35*popularity+advantage);
  const scope=scoped?`against ${input.opponent}`:'across matchups';
  return {bonus,reason:`Observed ${input.chosen.length?'next purchase after this prefix':'first completed item'}: ${row.games} games, ${(100*row.wins/row.games).toFixed(1)}% wins, patch ${e.patch}, ${e.position}, ${scope}. Sample-weighted evidence; outcomes are observational and include completion/survivorship bias.`};
}

/** Setup rows remain exact pages/pairs; components from incompatible pages are never mixed. */
export function setupObservations(input: {
  evidence?: BuildEvidence; champion: string; position: string | null; patch?: string;
  opponent?: string | null; kind: 'runePages' | 'spells';
}): { key: string; bonus: number; reason: string }[] {
  const e = input.evidence;
  if (!e || !input.position || !input.patch || e.champion !== input.champion || e.position !== input.position || e.patch !== input.patch) return [];
  const valid = (rows: PurchaseObservation[] = []) => rows.filter(r => Number.isInteger(r.games) && r.games > 0 && Number.isInteger(r.wins) && r.wins >= 0 && r.wins <= r.games);
  const matched = e.matchup && e.matchup.opponent === input.opponent ? valid(e.matchup[input.kind]) : [];
  const general = valid(e[input.kind]);
  const total = (rows: PurchaseObservation[]) => rows.reduce((n, r) => n + r.games, 0);
  const scoped = total(matched) >= 100 && matched.some(r => r.games >= 30);
  const rows = scoped ? matched : general, n = total(rows);
  if (n < 100) return [];
  const baseline = rows.reduce((n, r) => n + r.wins, 0) / n;
  return rows.filter(r => r.games >= 30).map(r => {
    const adjusted = (r.wins + 100 * baseline) / (r.games + 100);
    const support = r.games / (r.games + 100);
    return {key: r.key, bonus: support * (.8 * Math.sqrt(r.games / n) + Math.max(-.1, Math.min(.1, adjusted - baseline))),
      reason: `Observed ${input.kind === 'runePages' ? 'complete rune page' : 'spell pair'}: ${r.games} games, ${(100 * r.wins / r.games).toFixed(1)}% wins, patch ${e.patch}, ${e.position}, ${scoped ? `against ${input.opponent}` : 'across matchups'}. Observational support, not predicted win probability.`};
  });
}
