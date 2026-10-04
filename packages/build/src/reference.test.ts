import {expect,it} from 'vitest';
import {purchasePrior,type BuildEvidence} from './evidence.js';
import {referencePrior,type BuildReference} from './reference.js';
const e:BuildEvidence={champion:'AurelionSol',position:'MIDDLE',patch:'16.19',first:[],core:[{key:'3116>6653>3157',games:76,wins:40},{key:'3116>2503>3157',games:13,wins:8}]};
const base={champion:e.champion,position:e.position,patch:e.patch,chosen:[3116],candidate:6653};
it('retains dominant limited evidence without claiming a win-rate advantage',()=>{
 const p=purchasePrior({...base,evidence:e});expect(p?.level).toBe('limited');expect(p?.reason).toContain('Limited sample');
 expect(purchasePrior({...base,evidence:{...e,core:e.core.map(r=>({...r,wins:0}))}})?.bonus).toBe(p?.bonus);
 expect(purchasePrior({...base,candidate:2503,evidence:e})).toBeNull();
});
it('does not promote a split or tiny cohort',()=>{
 expect(purchasePrior({...base,evidence:{...e,core:[{key:'3116>6653>3157',games:30,wins:30},{key:'3116>2503>3157',games:30,wins:0}]}})).toBeNull();
 expect(purchasePrior({...base,evidence:{...e,core:[{key:'3116>6653>3157',games:29,wins:29}]}})).toBeNull();
});
it('uses one exact-stage cohort, never sums nested prefixes or overlapping legacy triples',()=>{
 const paths=[{key:'3116>6653',games:40,wins:20},{key:'3116>6653>3157',games:35,wins:20}];
 const p=purchasePrior({...base,evidence:{...e,paths}});
 expect(p?.reason).toContain('40 games');expect(p?.reason).not.toContain('75 games');
 expect(purchasePrior({...base,chosen:[3116,6653],candidate:3157,evidence:{...e,paths}})?.reason).toContain('35 games');
});
const reference:BuildReference={champion:e.champion,position:e.position,patch:e.patch,source:'Fixture',url:'https://example.com',retrievedAt:'2026-10-01',stages:[{prefix:[],item:3116,weight:.9},{prefix:[3116],item:6653,weight:.7},{prefix:[3116,6653],item:3157,weight:.2}]};
it('requires exact scope and prefix; does not turn independent slots into a longer path',()=>{
 const input={...base,held:[],reference};
 expect(referencePrior(input)?.reason).toContain('no verified sample size or win rate');
 for(const override of [{position:'TOP'},{patch:'16.18'},{champion:'Ahri'},{chosen:[2503]},{chosen:[3116,6653,3157]}])expect(referencePrior({...input,...override})).toBeNull();
});
it('inventory slots are unordered but proposed purchases remain ordered',()=>{
 expect(referencePrior({...base,held:[6653,3116],chosen:[],candidate:3157,reference})).not.toBeNull();
 expect(referencePrior({...base,held:[],chosen:[6653,3116],candidate:3157,reference})).toBeNull();
});
it('does not promote a rare losing option merely because it has thirty observations',()=>{
 const evidence={...e,champion:'Yasuo',first:[{key:'6673',games:460,wins:239},{key:'3046',games:38,wins:16}]};
 const query={evidence,champion:'Yasuo',position:'MIDDLE',patch:'16.19',chosen:[],candidate:3046};
 expect(purchasePrior(query)).toBeNull();
 expect(purchasePrior({...query,candidate:6673})).not.toBeNull();
 // A rare option with separated observational outcome intervals remains eligible.
 expect(purchasePrior({...query,evidence:{...evidence,first:[evidence.first[0]!,{key:'3046',games:50,wins:50}]}})).not.toBeNull();
});
it('only labels a sampled general majority when no supported alternative has separated better outcomes',()=>{
 const evidence={...e,first:[{key:'3116',games:300,wins:150},{key:'2503',games:100,wins:50}]};
 const q={...base,chosen:[],candidate:3116,evidence};
 expect(purchasePrior(q)?.dominantGeneral).toBe(true);
 expect(purchasePrior({...q,evidence:{...evidence,first:[evidence.first[0]!,{key:'2503',games:100,wins:90}]}})?.dominantGeneral).toBe(false);
 expect(purchasePrior({...q,evidence:{...evidence,first:[{key:'3116',games:59,wins:30},{key:'2503',games:41,wins:20}]}})?.dominantGeneral).toBe(false);
});

it('does not let overlapping outcome estimates overturn frequency, but retains bounded credit for a separated alternative',()=>{
 const evidence={...e,first:[{key:'3116',games:400,wins:200},{key:'2503',games:350,wins:179}]};
 const q={...base,evidence,chosen:[],candidate:2503};
 const ordinary=purchasePrior(q)!;
 expect(ordinary.bonus).toBe(purchasePrior({...q,evidence:{...evidence,first:[evidence.first[0]!,{key:'2503',games:350,wins:175}]}})!.bonus);
 expect(ordinary.bonus).toBeLessThan(purchasePrior({...q,candidate:3116})!.bonus);
 const separated=purchasePrior({...q,evidence:{...evidence,first:[evidence.first[0]!,{key:'2503',games:350,wins:350}]}})!;
 expect(separated.bonus).toBeGreaterThan(ordinary.bonus);
 expect(separated.reason).toContain('not causal superiority');
});
