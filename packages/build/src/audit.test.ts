import {describe,expect,it} from 'vitest';
import {parseChampionKits,parseItems} from '@coach/knowledge';
import {gameData} from '@coach/knowledge/test-data';
import {championProfile,recommendBuild,purchasePrior,type BuildEvidence} from './index.js';
const data=gameData(),items=parseItems(data.ddragonItems,data.merakiItems),kits=parseChampionKits(data.ddragonChampions,data.merakiChampions);
const kit=(id:string)=>kits.find(k=>k.id===id)!;
const enemies=['Darius','Viego','Zed','Caitlyn','Lulu'];
const run=(me:string,owned:number[]=[])=>recommendBuild({me:kit(me),items,owned,position:me==='Ahri'?'MIDDLE':'BOTTOM',enemies:enemies.map(id=>({kit:kit(id),laneOpponent:id===(me==='Ahri'?'Zed':'Caitlyn')}))});
describe('first-spike mechanics regressions (real patch fixture)',()=>{
 it('Ahri versus Zed starts with an offensive mana/ultimate spike, not a generic counter',()=>{
  const b=run('Ahri');expect(b.first!.id).toBe(3118);
  expect(b.first!.why.join(' ')).toMatch(/ultimate-triggered/);
  expect(b.first!.why.join(' ')).not.toMatch(/Observed first/);
  expect(b.audit!.basis).toBe('mechanics');
 });
 it('values offensive passives from their mechanics rather than champion/item names',()=>{
  const input={me:{...kit('Ahri'),id:'TestMage',name:'Test Mage'},items:items.map(i=>i.id===3118?{...i,name:'Test Item'}:i),enemies:[{kit:kit('Zed'),laneOpponent:true}]};
  const yes=recommendBuild(input),no=recommendBuild({...input,items:input.items.map(i=>i.id===3118?{...i,effects:[]}:i)});
  const get=(b:ReturnType<typeof recommendBuild>)=>b.audit!.candidates.find(c=>c.id===3118)?.score??0;
  expect(get(yes)).toBeGreaterThan(get(no));
 });
 it('Smolder values repeatable spell on-hit, mana and AD over a Phantom Dancer rush',()=>{
  const p=championProfile(kit('Smolder'));
  expect(p.spellOnHit).toBe(true);expect(p.scales.attackSpeed).toBeLessThan(.3);
  const b=run('Smolder');expect(b.first!.id).toBe(3508);
  expect(b.first!.why.join(' ')).toMatch(/repeatable on-hit spell/);
  expect(b.first!.why.join(' ')).toMatch(/mana/);
 });
 it('keeps the first spike coherent across recall budgets',()=>{
  for(const me of ['Ahri','Smolder'])for(const gold of [300,1200,2700]){
   const b=recommendBuild({me:kit(me),items,position:me==='Ahri'?'MIDDLE':'BOTTOM',enemies:enemies.map(id=>({kit:kit(id),laneOpponent:id===(me==='Ahri'?'Zed':'Caitlyn')})),economy:{gold,time:600,income:300,source:'live'}});
   expect(b.first!.id).toBe(me==='Ahri'?3118:3508);
  }
 });
 it('does not recommend the owned first item again',()=>{expect(run('Smolder',[3508]).first?.id).not.toBe(3508);});
 it('does not infer healing from Zed merely being a physical-damage opponent',()=>{
  const b=recommendBuild({me:kit('Ahri'),items,enemies:[{kit:kit('Zed'),laneOpponent:true}]});
  expect(b.threats.some(t=>t.kind==='healing')).toBe(false);
  expect([b.first,...b.next,...b.situational].some(i=>i?.id===3165)).toBe(false);
 });
});
const evidence:BuildEvidence={champion:'Ahri',position:'MIDDLE',patch:'16.19',first:[{key:'3118',games:800,wins:408},{key:'3100',games:200,wins:106}],core:[],matchup:{opponent:'Zed',first:[{key:'3118',games:20,wins:10},{key:'3100',games:2,wins:2}],core:[]}};
const query={evidence,champion:'Ahri',position:'MIDDLE',patch:'16.19',opponent:'Zed',chosen:[],candidate:3118};
describe('sample-weighted purchase observations (fictional statistical fixtures)',()=>{
 it('uses champion/role evidence when matchup samples are too small',()=>{
  const p=purchasePrior(query)!;expect(p.bonus).toBeGreaterThan(0);expect(p.reason).toContain('800 games');expect(p.reason).toContain('across matchups');
 });
 it('changes the real engine score only for valid, supported observations',()=>{
  const input={me:kit('Ahri'),items,position:'MIDDLE',patch:'16.19',enemies:[{kit:kit('Zed'),laneOpponent:true}]};
  const plain=recommendBuild(input),supported=recommendBuild({...input,evidence});
  const candidate=(b:ReturnType<typeof recommendBuild>)=>b.audit!.candidates.find(c=>c.id===3118)!;
  expect(candidate(supported).score).toBeGreaterThan(candidate(plain).score);
  expect(candidate(supported).empirical).toBeGreaterThan(0);
  expect(supported.first!.why.join(' ')).toContain('800 games');
  expect(recommendBuild({...input,evidence:{...evidence,patch:'16.18'}}).audit).toEqual(plain.audit);
 });
 it('rejects stale patches, other roles and other champions',()=>{
  for(const wrong of [{patch:'16.20'},{position:'TOP'},{champion:'Smolder'}])expect(purchasePrior({...query,...wrong})).toBeNull();
 });
 it('never promotes a two-game 100% win rate over a supported option',()=>{
  expect(purchasePrior({...query,candidate:3046,evidence:{...evidence,first:[...evidence.first,{key:'3046',games:2,wins:2}]}})).toBeNull();
 });
 it('uses a sufficiently sampled matchup and carries its scope',()=>{
  const e={...evidence,matchup:{opponent:'Zed',first:[{key:'3118',games:150,wins:77},{key:'3100',games:50,wins:25}],core:[]}};
  expect(purchasePrior({...query,evidence:e})!.reason).toContain('against Zed');
 });
 it('uses only cores whose purchase prefix matches, without claiming all games completed the core',()=>{
  const e={...evidence,core:[{key:'3118>3100>3089',games:150,wins:90},{key:'6655>3157>3089',games:300,wins:200}]};
  const p=purchasePrior({...query,evidence:e,chosen:[3118],candidate:3100})!;
  expect(p.reason).toContain('150 games');expect(p.reason).toContain('survivorship bias');
  expect(purchasePrior({...query,evidence:e,chosen:[3118],candidate:3157})).toBeNull();
 });
});

describe('user-provided Render excerpt (2026-09-28, patch 16.19; top five only)',()=>{
 const samples:[string,string,number[][]][]=[
  ['Ahri','MIDDLE',[[3118,510,264],[2503,272,156],[6655,5,3],[4646,3,0],[6657,3,2]]],
  ['Smolder','BOTTOM',[[3508,69,30],[3078,2,1],[3031,1,1],[3161,1,1],[3814,1,0]]],
  ['Yasuo','TOP',[[3153,122,74],[6673,66,34],[6672,64,31],[3095,44,25],[3032,23,9]]],
  ['Yasuo','MIDDLE',[[6673,460,239],[3153,108,52],[3095,104,57],[6672,39,20],[3046,38,16]]],
  ['Yasuo','BOTTOM',[[3095,86,49],[6673,78,48],[6672,64,33],[3153,53,29],[3032,21,7]]],
 ];
 for(const [champion,position,rows] of samples)it(`${champion} ${position}: evidence reaches eligible engine candidates without leaking roles`,()=>{
  const observed:BuildEvidence={champion,position,patch:'16.19',first:rows.map(([id,games,wins])=>({key:String(id),games:games!,wins:wins!})),core:[]};
  const input={me:kit(champion),items,position,patch:'16.19',enemies:[]};
  const plain=recommendBuild(input),actual=recommendBuild({...input,evidence:observed});
  if(champion==='Smolder') {
   expect(actual.audit).toEqual(plain.audit); // 74 observed completions cannot pass 100-game gate.
   expect(actual.first!.id).toBe(3508); // Mechanics, not a fabricated statistical endorsement.
  } else {
   expect(actual.audit!.candidates.some(c=>c.empirical>0)).toBe(true);
   for(const c of actual.audit!.candidates.filter(c=>c.empirical>0)) {
    expect(observed.first.find(r=>r.key===String(c.id))!.games).toBeGreaterThanOrEqual(30);
   }
  }
  expect(recommendBuild({...input,evidence:{...observed,position:position==='TOP'?'MIDDLE':'TOP'}}).audit).toEqual(plain.audit);
  expect(recommendBuild({...input,evidence:{...observed,patch:'16.18'}}).audit).toEqual(plain.audit);
 });
});
