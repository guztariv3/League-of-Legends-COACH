import {expect,it} from 'vitest';
import {matchupAudit,validateAuditExport,type AuditExport} from './matchup-audit.js';
import type {CoverageCount} from './coverage.js';
const roster=[{id:'A',detail:'full',positions:['MIDDLE']},{id:'B',detail:'full',positions:['TOP']}];
const row=(o:Partial<CoverageCount>={}):CoverageCount=>({patch:'16.19',champion:'A',position:'MIDDLE',kind:'first_item',key:'1',games:100,wins:50,...o});
const exportOf=(rows:CoverageCount[]):AuditExport=>({schemaVersion:1,patch:'16.19',complete:true,generatedAt:'2026-09-29T00:00:00Z',source:'test',rows});
it('includes every ordered role/rival combination and distinguishes unavailable evidence from empty data',()=>{
 const missing=matchupAudit(roster,'16.19');expect([...missing.matchups()]).toHaveLength(20);
 expect([...missing.matchups()][0]!.first_item_sample).toBe('not_verified');
 const empty=matchupAudit(roster,'16.19',exportOf([]));expect([...empty.matchups()][0]!.first_item_sample).toBe('no_observations');
 expect([...empty.matchups()].filter(r=>r.mirror)).toHaveLength(10);
});
it('isolates roles and opponents, keeps rare observations and exposes general fallback',()=>{
 const data=exportOf([row(),row({kind:'matchup_first_item',key:'B|1',games:93}),row({kind:'matchup_first_item',key:'B|2',games:7,wins:4})]);
 const rows=[...matchupAudit(roster,'16.19',data).matchups()];
 const b=rows.find(r=>r.champion==='A'&&r.position==='MIDDLE'&&r.opponent==='B')!;
 expect(b.first_item_observations).toBe(100);expect(b.first_item_sample).toBe('sufficient_sample');expect(b.first_item_sample_scope).toBe('matchup');
 expect(rows.find(r=>r.champion==='A'&&r.position==='TOP')!.first_item_sample).toBe('no_observations');
 expect(rows.find(r=>r.champion==='A'&&r.position==='MIDDLE'&&r.opponent==='A')!.first_item_sample_scope).toBe('general_role');
});
it('does not call fragmented low-sample options sufficient',()=>{
 const rows=Array.from({length:10},(_,i)=>row({key:String(i),games:10,wins:5}));
 expect([...matchupAudit(roster,'16.19',exportOf(rows)).general()].find(r=>r.position==='MIDDLE'&&r.champion==='A')!.first_item_sample).toBe('insufficient_sample');
});
it('groups later-purchase evidence by prefix, never by the global core total',()=>{
 const rows=[row({kind:'core',key:'1>2>3',games:60}),row({kind:'core',key:'1>2>4',games:40,wins:20}),row({kind:'core',key:'5>6>7',games:40,wins:20})];
 const p=[...matchupAudit(roster,'16.19',exportOf(rows)).prefixes()];
 expect(p.find(r=>r.prefix==='1')!.next_item_sample).toBe('sufficient_sample');
 expect(p.find(r=>r.prefix==='5')!.next_item_sample).toBe('insufficient_sample');
});
it('rejects partial, wrong-patch, duplicate and invalid exports',()=>{
 for(const x of [{...exportOf([]),complete:false},{...exportOf([]),patch:'16.18'},exportOf([row(),row()]),exportOf([row({wins:101})])])expect(()=>validateAuditExport(x,'16.19')).toThrow();
});
