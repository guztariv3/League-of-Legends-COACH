import { expect, it } from 'vitest';
import { coverageReport, type CoverageCount } from './coverage.js';
const row = (change: Partial<CoverageCount> = {}): CoverageCount => ({ patch:'16.19',champion:'Yasuo',position:'MIDDLE',kind:'first_item',key:'3153',games:100,wins:52,...change });
it('does not transfer samples across patch, role or champion, and lists missing roles', () => {
 const report=coverageReport([row(),row({position:'TOP',games:99}),row({patch:'16.18',position:'BOTTOM'}),row({champion:'Ahri',position:'BOTTOM'})],['Yasuo'],'16.19');
 expect(report).toHaveLength(5);
 expect(report.find(r=>r.position==='MIDDLE')!.general.first_item!.sampleThresholdMet).toBe(true);
 for(const r of report.filter(r=>r.position!=='MIDDLE')) expect(r.general.first_item!.sampleThresholdMet).toBe(false);
});
it('keeps rare options in denominators without pooling opponents or kinds', () => {
 const report=coverageReport([row({kind:'matchup_first_item',key:'Zed|3153',games:60}),row({kind:'matchup_first_item',key:'Lux|3153',games:60}),row({games:93}),row({key:'3006',games:7,wins:4}),row({kind:'rune_page',games:100})],['Yasuo'],'16.19');
 const middle=report.find(r=>r.position==='MIDDLE')!;
 expect(middle.general.first_item!.observations).toBe(100);
 expect(middle.general.first_item!.sampleThresholdMet).toBe(true);
 expect(middle.matchups).toHaveLength(2);
 expect(middle.matchups.every(m=>!m.byKind.first_item!.sampleThresholdMet)).toBe(true);
 expect(middle.optimalityVerified).toBe(false);
});
