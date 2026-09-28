/** Read counters only; never starts the crawler or runs migrations. */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { coverageReport, type CoverageCount } from './coverage.js';
import { gameData } from '../../../../packages/knowledge/src/test-data.js';
import { parseChampionKits } from '@coach/knowledge';

async function main() {
 const patch = process.argv[2];
 if (!patch || !/^\d+\.\d+$/.test(patch)) throw new Error('Pass the server patch, e.g. pnpm --filter @coach/api stats:coverage 16.19');
 const snapshot=gameData();
 const champions=parseChampionKits(snapshot.ddragonChampions,snapshot.merakiChampions).map(c=>c.id);
 const query='SELECT patch, champion, position, kind, key, games, wins FROM stats_counts WHERE patch = $1';
 let rows:CoverageCount[];
 if(process.env.DATABASE_URL){
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});
  try { await client.connect(); await client.query('BEGIN READ ONLY'); rows=(await client.query<CoverageCount>(query,[patch])).rows; }
  finally { await client.end(); }
 } else {
  const dir=resolve(process.env.PGLITE_DIR || '.data/pglite');
  if(!existsSync(dir)) throw new Error('No local database exists. Run the test server and collect matches first.');
  const client=new PGlite(dir);
  try { await client.exec('BEGIN READ ONLY'); rows=(await client.query<CoverageCount>(query,[patch])).rows; }
  finally { await client.close(); }
 }
 const coverage=coverageReport(rows,champions,patch);
 console.log(JSON.stringify({patch,rosterSnapshot:snapshot.meta.ddragonVersion,generatedAt:new Date().toISOString(),
  source:'existing_database_counters',provenance:'Counters alone cannot certify that a database contains real Riot matches.',
  limitation:'Sample thresholds are not validation of optimal builds. Missing roles may be uncommon. Matchups absent from this report have no recorded scoped options.',
  champions:champions.length,cases:coverage.length,coverage},null,2));
}
main().catch(()=>{ console.error('Coverage unavailable: check patch argument, database configuration and stats tables. Stop the local API before opening its PGlite database. No credentials are printed.'); process.exitCode=1; });
