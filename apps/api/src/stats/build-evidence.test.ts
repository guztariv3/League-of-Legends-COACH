import { describe, expect, it } from 'vitest';
import { buildEvidence } from './build-evidence.js';
import type { ChampionStats, StatOption } from './store.js';
const row=(key:string):StatOption=>({key,games:150,wins:77,share:.5,winRate:77/150,avgMinute:12});
const stats:ChampionStats={champion:'Ahri',position:'MIDDLE',patch:'16.19',patchLabel:'current',games:300,wins:154,winRate:154/300,byKind:{first_item:[row('3118')],matchup_first_item:[row('Zed|3118'),row('Lux|3100')],matchup_core:[row('Zed|3118>3100>3089')]}};
describe('purchase evidence API boundary',()=>{
 it('separates the requested lane opponent from other matchups',()=>{
  const e=buildEvidence(stats,'Ahri','MIDDLE','16.19','Zed')!;
  expect(e.first).toEqual([{key:'3118',games:150,wins:77}]);
  expect(e.matchup!.first).toEqual([{key:'3118',games:150,wins:77}]);
  expect(e.matchup!.core[0]!.key).toBe('3118>3100>3089');
 });
 it('does not promote display fallback, inferred positions or stale statistics',()=>{
  expect(buildEvidence({...stats,patchLabel:'previous'},'Ahri','MIDDLE','16.19','Zed')).toBeUndefined();
  expect(buildEvidence(stats,'Ahri',null,'16.19','Zed')).toBeUndefined();
  expect(buildEvidence(stats,'Ahri','TOP','16.19','Zed')).toBeUndefined();
  expect(buildEvidence(stats,'Ahri','MIDDLE','16.20','Zed')).toBeUndefined();
  expect(buildEvidence(null,'Ahri','MIDDLE','16.19','Zed')).toBeUndefined();
 });
});
