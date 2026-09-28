import { describe, expect, it } from 'vitest';
import { parseChampionKits, parseItems, parseRunes, parseSummonerSpells } from '@coach/knowledge';
import { gameData } from '@coach/knowledge/test-data';
import { championProfile, recommendBuild, recommendSetup, POSITIONS, normalizePosition, type BuildEvidence } from './index.js';
const d=gameData(), kits=parseChampionKits(d.ddragonChampions,d.merakiChampions), items=parseItems(d.ddragonItems,d.merakiItems), runes=parseRunes(d.perks,d.perkStyles), spells=parseSummonerSpells(d.summoners);
const kit=(id:string)=>kits.find(k=>k.id===id)!;
const enemies=['Garen','LeeSin','Ahri','Jinx','Thresh'].map(id=>({kit:kit(id)}));
const pageKey=(page:NonNullable<ReturnType<typeof recommendSetup>['runes']>)=>[runes.trees.find(t=>t.name===page.primaryTree)!.id,runes.trees.find(t=>t.name===page.secondaryTree)!.id,page.keystone.id,...page.primary.map(r=>r.id),...page.secondary.map(r=>r.id),...page.shards.map(r=>r.id)].join('>');

describe('entire patch roster × explicit position (mechanical invariants, not optimality)',()=>{
 it('covers every champion in the Riot snapshot, including future additions',()=>{
  const official=Object.keys((d.ddragonChampions as {data:Record<string,unknown>}).data).sort();
  expect(kits.map(k=>k.id).sort()).toEqual(official);
 });
 for(const k of kits)it(`${k.id}: five positions, legal setup, purchasable targets and finite scores`,()=>{
  for(const position of POSITIONS){
   const b=recommendBuild({me:k,items,enemies,position,baseline:true});
   const s=recommendSetup({me:k,enemies,runes,spells,position}),page=s.runes!;
   if(k.detail !== 'full') {
    expect(b.first).toBeNull();expect(b.next).toEqual([]);expect(s.runes).toBeNull();
    expect(b.kit.join(' ')).toContain('withheld');continue;
   }
   expect(page,k.id).not.toBeNull();
   const primary=runes.trees.find(t=>t.name===page.primaryTree)!,secondary=runes.trees.find(t=>t.name===page.secondaryTree)!;
   expect(primary.rows[0]).toContain(page.keystone.id);
   page.primary.forEach((r,i)=>expect(primary.rows[i+1]).toContain(r.id));
   expect(primary.secondary).toContain(secondary.id);
   const rows=page.secondary.map(r=>secondary.rows.findIndex(row=>row.includes(r.id)));
   expect(rows.every(n=>n>0) && new Set(rows).size===2).toBe(true);
   page.shards.forEach((r,i)=>expect(runes.shardRows[i]!.shards).toContain(r.id));
   for(const r of [page.keystone,...page.primary,...page.secondary]){
    const text=runes.runes.find(x=>x.id===r.id)!.short;
    if(k.resource!=='MANA' && !(k.resource==='ENERGY' && /energy/i.test(text)))expect(text).not.toMatch(/\bmana\b/i);
   }
   expect(s.spells).toHaveLength(2);
   expect(new Set(s.spells.map(s=>s.id)).size).toBe(2);
   expect(s.spells.some(s=>s.id==='SummonerSmite')).toBe(position==='JUNGLE');
   expect(b.first).not.toBeNull();
   for(const pick of [b.first,...b.next,b.boots,...b.situational].filter(p=>p!==null)){
    const item=items.find(i=>i.id===pick!.id)!;
    expect(item.purchasable).toBe(true);expect(item.maps).toContain(11);
    expect(Number.isFinite(pick!.score)).toBe(true);
    expect(item.requiredChampion===null || item.requiredChampion===k.id).toBe(true);
    expect(pick!.why.length).toBeGreaterThan(0);
   }
   expect(new Set([b.first!,...b.next].map(i=>i.id)).size).toBe(1+b.next.length);
   if(championProfile(k).cannotBuyBoots)expect(b.boots).toBeNull();
   expect(b.kit.join(' ')).toContain(position==='UTILITY'?'Support:':position==='BOTTOM'?'Bot carry:':position==='MIDDLE'?'Mid:':position==='JUNGLE'?'Jungle:':'Top:');
  }
 },10000);
});

describe('mechanics and multi-role isolation',()=>{
 it('uses kit restrictions and cooldown scalings rather than champion-name exceptions',()=>{
  expect(championProfile(kit('Cassiopeia')).cannotBuyBoots).toBe(true);
  expect(championProfile(kit('Pyke')).cannotGainHealth).toBe(true);
  for(const id of ['Yasuo','Yone','Belveth'])expect(championProfile(kit(id)).attackSpeedCooldown,id).toBe(true);
  for(const id of ['Viego','Belveth'])expect(championProfile(kit(id)).spellOnHit,id).toBe(false);
  expect(championProfile(kit('Smolder')).spellOnHit).toBe(true);
  for(const id of ['Yasuo','Yone'])expect(championProfile(kit(id)).critMultiplier,id).toBe(2);
 });
 it('does not treat incidental magic scaling as a reason for magic-penetration boots on Smolder',()=>{
  const b=recommendBuild({me:kit('Smolder'),items,enemies,position:'BOTTOM'});
  expect(b.boots!.id).not.toBe(3020);
 });
 it('never offers a zero-cost progression upgrade as ordinary purchased boots',()=>{
  const b=recommendBuild({me:kit('Yasuo'),items,enemies,position:'MIDDLE'});
  expect([3171,3172,3173,3174,3175]).not.toContain(b.boots!.id);
 });
 it('does not join effects across mismatched item names',()=>{
  const x=items.find(i=>i.id===3172)!;
  expect(x.name).toBe('Gunmetal Greaves');expect(x.detail).toBe('ddragon');
  expect(x.effects.map(e=>e.name)).not.toContain('Like the Wind');
 });
 it('normalizes aliases without inventing an unknown position',()=>{
  expect(normalizePosition('mid')).toBe('MIDDLE');expect(normalizePosition('SUPPORT')).toBe('UTILITY');expect(normalizePosition('NONE')).toBeNull();
 });
 it('Yasuo top/mid/bot get independently evaluated pages; role evidence never leaks',()=>{
  const input={me:kit('Yasuo'),enemies,runes,spells,patch:'16.19'};
  const pages=POSITIONS.map(position=>recommendSetup({...input,position}).runes!);
  expect(new Set(pages.map(pageKey)).size).toBeGreaterThan(1);
  for(const position of ['TOP','MIDDLE','BOTTOM']){
   const normal=recommendSetup({...input,position});
   const evidence:BuildEvidence={champion:'Yasuo',position:'UTILITY',patch:'16.19',first:[],core:[],runePages:[{key:pageKey(pages[4]!),games:500,wins:300}]};
   expect(recommendSetup({...input,position,evidence})).toEqual(normal);
  }
 });
 it('uses a supported legal complete page and rejects malformed pages and stale evidence',()=>{
  const input={me:kit('Yasuo'),enemies,runes,spells,position:'TOP',patch:'16.19'};
  const base=recommendSetup(input),key=pageKey(base.runes!);
  const evidence:BuildEvidence={champion:'Yasuo',position:'TOP',patch:'16.19',first:[],core:[],runePages:[{key,games:500,wins:280}]};
  const supported=recommendSetup({...input,evidence});
  expect(supported.runes!.keystone.why).toContain('500 games');
  expect(pageKey(supported.runes!)).toBe(key);
  expect(recommendSetup({...input,evidence:{...evidence,patch:'16.18'}})).toEqual(base);
  expect(recommendSetup({...input,evidence:{...evidence,runePages:[{key:'8000>8000>1>1>1>1>1>1>1>1>1',games:500,wins:500}]}})).toEqual(base);
 });
});

it.each(['trees','secondary','shards'])('invalid %s cannot suppress valid champion/role rune evidence', invalid=>{
 const input={me:kit('Yasuo'),enemies:[{kit:kit('Ahri'),laneOpponent:true}],runes,spells,position:'MIDDLE',patch:'16.19'};
 const key=pageKey(recommendSetup(input).runes!);
 const bad=key.split('>');
 if(invalid==='trees') bad[1]=bad[0]!;
 if(invalid==='secondary') bad[7]=bad[6]!;
 if(invalid==='shards') bad[8]='999999';
 const evidence:BuildEvidence={champion:'Yasuo',position:'MIDDLE',patch:'16.19',first:[],core:[],runePages:[{key,games:500,wins:260}],
  matchup:{opponent:'Ahri',first:[],core:[],runePages:[{key,games:10,wins:5},{key:bad.join('>'),games:200,wins:150}]}};
 const answer=recommendSetup({...input,evidence});
 expect(answer.runes!.keystone.why).toContain('500 games');
 expect(answer.runes!.keystone.why).toContain('across matchups');
 expect(pageKey(answer.runes!)).toBe(key);
});
