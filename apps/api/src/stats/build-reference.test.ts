import {expect,it} from 'vitest';
import {buildReference} from './build-reference.js';
import {recommendBuild} from '@coach/build';
import {parseChampionKits,parseItems} from '@coach/knowledge';
import {gameData} from '@coach/knowledge/test-data';
const now=Date.parse('2026-10-02T00:00:00Z');
it('requires verified role, patch and a recent, non-future snapshot',()=>{
 expect(buildReference('AurelionSol','MIDDLE','16.19',now)).toBeDefined();
 expect(buildReference('AurelionSol','UNKNOWN','16.19',now)).toBeUndefined();
 expect(buildReference('AurelionSol','MIDDLE','16.20',now)).toBeUndefined();
 expect(buildReference('AurelionSol','MIDDLE','16.19',now+15*86400000)).toBeUndefined();
 expect(buildReference('AurelionSol','MIDDLE','16.19',now-5*86400000)).toBeUndefined();
 expect(buildReference('Kayn','JUNGLE','16.19',now)).toBeUndefined();
});
it('uses the documented Aurelion prefix and does not fabricate external WR',()=>{
 const d=gameData(),me=parseChampionKits(d.ddragonChampions,d.merakiChampions).find(x=>x.id==='AurelionSol')!,items=parseItems(d.ddragonItems,d.merakiItems);
 const b=recommendBuild({me,items,enemies:[],position:'MIDDLE',patch:'16.19',reference:buildReference(me.id,'MIDDLE','16.19',now)});
 expect([b.first?.id,b.next[0]?.id]).toEqual([3116,6653]);
 expect(b.first?.why.join(' ')).toContain('OneTricks.gg');expect(b.audit?.basis).toBe('reference');
 expect([b.first,...b.next].some(x=>x?.id===3165)).toBe(false);
});
it('external popularity never supplies a missing healing threat',()=>{
 const d=gameData(),kits=parseChampionKits(d.ddragonChampions,d.merakiChampions),items=parseItems(d.ddragonItems,d.merakiItems);
 for(const champion of ['Akali','Ahri','AurelionSol']){
  const me=kits.find(x=>x.id===champion)!;
  const reference={champion,position:'MIDDLE',patch:'16.19',source:'Counter regression fixture',url:'https://example.com',retrievedAt:'2026-10-01',stages:[{prefix:[],item:3165,weight:1}]};
  const build=recommendBuild({me,items,enemies:[],position:'MIDDLE',patch:'16.19',reference});
  expect([build.first,...build.next,...build.situational].some(x=>x?.id===3165)).toBe(false);
 }
});
it('continues the purchased prefix after transformation and ignores the free support quest slot',()=>{
 const d=gameData(),kits=parseChampionKits(d.ddragonChampions,d.merakiChampions),items=parseItems(d.ddragonItems,d.merakiItems);
 const me=kits.find(x=>x.id==='AurelionSol')!;
 const reference={champion:me.id,position:'MIDDLE',patch:'16.19',source:'Inventory regression fixture',url:'https://example.com',retrievedAt:'2026-10-01',stages:[{prefix:[3003],item:3116,weight:1}]};
 const b=recommendBuild({me,items,owned:[3040,3869],enemies:[],position:'MIDDLE',patch:'16.19',reference});
 expect(b.first?.id).toBe(3116);
 expect(b.first?.why.join(' ')).toContain('Inventory regression fixture');
 expect([b.first,...b.next].some(x=>x?.id===3003)).toBe(false);
});
