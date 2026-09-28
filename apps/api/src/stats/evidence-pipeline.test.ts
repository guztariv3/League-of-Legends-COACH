import { afterAll, beforeAll, expect, it } from 'vitest';
import { purchasePrior } from '@coach/build';
import { openDatabase, schema, type Database } from '../db/index.js';
import { championStats } from './store.js';
import { buildEvidence } from './build-evidence.js';

let database: Database;
beforeAll(async () => { database = await openDatabase(undefined, undefined); });
afterAll(async () => { await database.close(); });

it('keeps rare complete paths until matching next purchases have been aggregated', async () => {
  // Synthetic regression: 20 disjoint three-item paths, five games each.
  // Every path shares the same first two purchases: 100 supported next purchases.
  const base = { patch: '16.19', champion: 'Ahri', position: 'MIDDLE' };
  await database.db.insert(schema.statsCounts).values([
    {...base, kind: 'games', key: '', games: 100, wins: 60},
    ...Array.from({length:20}, (_,i) => ({...base, kind:'core', key:`3118>3100>${4000+i}`, games:5, wins:3})),
  ]);
  const stats = (await championStats(database.db, 'Ahri', 'MIDDLE', '16.19'))!;
  expect(stats.byKind.core).toBeUndefined(); // Display still hides five-game paths.
  const evidence = buildEvidence(stats, 'Ahri', 'MIDDLE', '16.19');
  const prior = purchasePrior({evidence, champion:'Ahri', position:'MIDDLE', patch:'16.19', chosen:[3118], candidate:3100});
  expect(prior?.reason).toContain('100 games');
  expect(purchasePrior({evidence, champion:'Ahri', position:'TOP', patch:'16.19', chosen:[3118], candidate:3100})).toBeNull();
});

it('keeps small first-item outcomes in the baseline without endorsing their 100% win rate', async () => {
  const base = { patch:'16.19', champion:'Yasuo', position:'TOP' };
  await database.db.insert(schema.statsCounts).values([
    {...base,kind:'games',key:'',games:106,wins:56},
    {...base,kind:'first_item',key:'3153',games:100,wins:50},
    {...base,kind:'first_item',key:'3031',games:6,wins:6},
  ]);
  const stats = (await championStats(database.db,'Yasuo','TOP','16.19'))!;
  expect(stats.byKind.first_item).toHaveLength(1);
  const evidence = buildEvidence(stats,'Yasuo','TOP','16.19')!;
  expect(evidence.first).toHaveLength(2);
  const query = {evidence,champion:'Yasuo',position:'TOP',patch:'16.19',chosen:[]};
  expect(purchasePrior({...query,candidate:3031})).toBeNull();
  const full = purchasePrior({...query,candidate:3153})!;
  const filtered = purchasePrior({...query,candidate:3153,evidence:{...evidence,first:evidence.first.filter(r=>r.games>=8)}})!;
  expect(full.bonus).not.toBe(filtered.bonus);
});
