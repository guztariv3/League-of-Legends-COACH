/** Observational purchase evidence, not a causal estimate or a predicted win probability. */
export interface PurchaseObservation { key: string; games: number; wins: number }
export interface BuildEvidence {
  champion: string; position: string; patch: string;
  first: PurchaseObservation[]; core: PurchaseObservation[]; paths?: PurchaseObservation[]; runePages?: PurchaseObservation[]; keystones?: PurchaseObservation[]; spells?: PurchaseObservation[];
  matchup?: { opponent: string; first: PurchaseObservation[]; core: PurchaseObservation[]; paths?: PurchaseObservation[]; runePages?: PurchaseObservation[]; spells?: PurchaseObservation[] };
}
export interface PurchasePrior { bonus:number; reason:string; level: "sampled" | "limited"; dominantGeneral:boolean; separatedGeneralOutcome:boolean }

export function purchasePrior(input: {
  evidence?:BuildEvidence; champion:string; position?:string|null; patch?:string;
  opponent?:string|null; chosen:number[]; candidate:number;
  /** Completed items currently held. Inventory slot order is NOT purchase order. */
  held?:number[];
}): PurchasePrior | null {
  const e=input.evidence;
  if (!e || !input.position || !input.patch || e.champion!==input.champion || e.position!==input.position || e.patch!==input.patch) return null;
  const valid=(rows:PurchaseObservation[])=>rows.filter(r=>Number.isInteger(r.games)&&r.games>=0&&Number.isInteger(r.wins)&&r.wins>=0&&r.wins<=r.games&&/^\d+(>\d+)*$/.test(r.key));
  const options=(rows:PurchaseObservation[], exactStage=false)=>{
    const counts=new Map<number,{games:number;wins:number}>();
    for(const r of valid(rows)){
      const ids=r.key.split('>').map(Number);
      if(exactStage && ids.length!==(input.held?.length??0)+input.chosen.length+1)continue;
      const held=input.held??[];
      // Match the observed prefix as a multiset: never infer chronology from slots,
      // or skip a missing/sold item in order to borrow an unrelated build's evidence.
      const prefix=ids.slice(0,held.length).sort((a,b)=>a-b);
      if(prefix.length!==held.length || [...held].sort((a,b)=>a-b).some((id,i)=>prefix[i]!==id))continue;
      if(input.chosen.some((id,i)=>ids[held.length+i]!==id))continue;
      const id=ids[held.length+input.chosen.length];if(!id)continue;
      const c=counts.get(id)??{games:0,wins:0};c.games+=r.games;c.wins+=r.wins;counts.set(id,c);
    }
    return counts;
  };
  const later=Boolean(input.chosen.length || input.held?.length);
  const total=(m:Map<number,{games:number;wins:number}>)=>[...m.values()].reduce((n,r)=>n+r.games,0);
  const cohort=(scope:{first:PurchaseObservation[];core:PurchaseObservation[];paths?:PurchaseObservation[]})=>{
    if(!later)return options(scope.first);
    const stage=options(scope.paths??[],true);
    // Never add overlapping legacy triples and stage prefixes. Prefer the new,
    // less completion-biased cohort once it has 30 observations at this stage.
    return total(stage)>=30 ? stage : options(scope.core);
  };
  const general=cohort(e);
  const match=e.matchup && e.matchup.opponent===input.opponent ? cohort(e.matchup) : new Map<number,{games:number;wins:number}>();
  // Choose the scope for the whole comparison, never separately for each candidate.
  // Once a matchup supports a ranking, sparse options get no empirical bonus rather
  // than importing a differently sampled general-popularity bonus.
  const scoped=total(match)>=100 && [...match.values()].some(row=>row.games>=30);
  const pool=scoped?match:general,n=total(pool),row=pool.get(input.candidate);
  if(!row || n<30 || row.games<30)return null;
  // A limited cohort can support a dominant *purchase frequency*, not a claim
  // of superior win rate. The Wilson 95% lower bound must exceed one half.
  const share=row.games/n,z=1.96;
  const lower=(share+z*z/(2*n)-z*Math.sqrt(share*(1-share)/n+z*z/(4*n*n)))/(1+z*z/n);
  const limited=n<100;
  if(limited && lower<=.5)return null;
  const mostCommon=[...pool.values()].reduce((a,b)=>a.games>=b.games?a:b);
  const interval=(wins:number,games:number)=>{
    const p=wins/games,den=1+z*z/games,center=(p+z*z/(2*games))/den;
    const half=z*Math.sqrt(p*(1-p)/games+z*z/(4*games*games))/den;
    return {lower:center-half,upper:center+half};
  };
  if(!limited && row.games<mostCommon.games*.2){
    // Merely clearing 30 observations must not let a rare option beat the main
    // route on generic stat efficiency. Retain it only with clearly separated
    // observational outcome intervals; this still does not establish causality.
    if(interval(row.wins,row.games).lower<=interval(mostCommon.wins,mostCommon.games).upper)return null;
  }
  const wins=[...pool.values()].reduce((s,r)=>s+r.wins,0);
  const baseline=wins/n;
  const shrunk=(row.wins+100*baseline)/(row.games+100);
  const support=row.games/(row.games+100);
  const popularity=Math.sqrt(row.games/n);
  // Small, overlapping observational WR differences must not reverse the
  // purchase baseline. Only a clearly separated alternative gets outcome credit.
  const separated=!limited && row!==mostCommon && interval(row.wins,row.games).lower>interval(mostCommon.wins,mostCommon.games).upper;
  const advantage=separated?Math.max(0,Math.min(.1,shrunk-baseline)):0;
  const bonus=support*(.35*popularity+advantage);
  const scope=scoped?`against ${input.opponent}`:'across matchups';
  // A broad majority may anchor the default only if no sufficiently observed
  // alternative has clearly separated, better outcomes. This is descriptive,
  // not causal, and must never override a supported matchup-specific cohort.
  const dominantGeneral=!scoped && !limited && lower>.5 && ![...pool.values()].some(other=>
    other.games>=30 && interval(other.wins,other.games).lower>interval(row.wins,row.games).upper);
  return {bonus,dominantGeneral,separatedGeneralOutcome:separated && !scoped,level:limited?"limited":"sampled",reason:`${limited?"Limited sample; dominant purchase frequency, not proven superiority. ":""}Observed ${later?'next purchase after a matching completed-item prefix':'first completed item'}: ${row.games} games, ${(100*row.wins/row.games).toFixed(1)}% wins, patch ${e.patch}, ${e.position}, ${scope}. ${separated?"Separated observed outcome intervals contribute bounded ranking credit, not causal superiority. ":"No outcome-advantage bonus is applied to this option. "}Sample-weighted evidence; outcomes are observational and include completion/survivorship bias.`};
}

/** Setup rows remain exact pages/pairs; components from incompatible pages are never mixed. */
export function setupObservations(input: {
  evidence?: BuildEvidence; champion: string; position: string | null; patch?: string;
  opponent?: string | null; kind: 'runePages' | 'keystones' | 'spells';
  /** Validate catalog legality before selecting a scope or calculating sample weights. */
  acceptKey?: (key: string) => boolean;
}): { key: string; bonus: number; reason: string }[] {
  const e = input.evidence;
  if (!e || !input.position || !input.patch || e.champion !== input.champion || e.position !== input.position || e.patch !== input.patch) return [];
  const valid = (rows: PurchaseObservation[] = []) => rows.filter(r => Number.isInteger(r.games) && r.games > 0 && Number.isInteger(r.wins) && r.wins >= 0 && r.wins <= r.games && (!input.acceptKey || input.acceptKey(r.key)));
  const matched = input.kind!=='keystones' && e.matchup && e.matchup.opponent === input.opponent ? valid(e.matchup[input.kind]) : [];
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
      reason: `Observed ${input.kind === 'runePages' ? 'complete rune page' : input.kind==='keystones'?'keystone only':'spell pair'}: ${r.games} games, ${(100 * r.wins / r.games).toFixed(1)}% wins, patch ${e.patch}, ${e.position}, ${scoped ? `against ${input.opponent}` : 'across matchups'}. Observational support, not predicted win probability.`};
  });
}
