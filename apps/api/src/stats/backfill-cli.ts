/** Offline operator tool: preview by default, no automatic migrations or crawler startup. */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { gameFactsSource } from '@coach/knowledge';
import { RiotClient } from '@coach/riot';
import { schema } from '../db/index.js';
import { backfillCandidates, recoverCandidate } from './backfill.js';
import { patchInfoOf } from './crawler.js';

async function main() {
  const [patch, limitText='10', mode='--preview', version]=process.argv.slice(2);
  const limit=Number(limitText);
  if(!patch || !/^\d+\.\d+$/.test(patch) || !Number.isInteger(limit) || limit<1 || limit>20 ||
    !['--preview','--apply'].includes(mode) || process.argv.slice(2).length>4) throw new Error('Invalid arguments');
  if(!process.env.DATABASE_URL) throw new Error('Existing PostgreSQL database required');
  if(mode==='--apply' && (!process.env.RIOT_API_KEY || !version || !/^\d+\.\d+\.\d+$/.test(version) || version.split('.').slice(0,2).join('.')!==patch)) throw new Error('Exact catalog version and existing Riot key required');
  const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:15000});
  try {
    await client.connect();
    const db=drizzle(client,{schema});
    if(mode==='--preview') await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    else {
      const lock=await client.query('SELECT pg_try_advisory_lock(70190510) AS acquired');
      if(!lock.rows[0]?.acquired) throw new Error('Another backfill is active');
    }
    const candidates=await backfillCandidates(db,patch,limit);
    const blocked=await client.query(`SELECT count(*) AS n FROM stats_enrichments e JOIN stats_matches m USING (match_id) WHERE m.patch=$1 AND e.status='legacy_unknown'`,[patch]);
    console.log(JSON.stringify({mode,patch,limit,selected:candidates.length,ambiguousHistoricalMatches:blocked.rows[0].n}));
    if(mode==='--preview') { await client.query('ROLLBACK'); return; }
    if(!candidates.length) return;
    const facts=await gameFactsSource({version:()=>version!}).get(30000);
    if(!facts || facts.version!==version) throw new Error('Exact catalog unavailable');
    const info=patchInfoOf(facts);
    const riot=new RiotClient({apiKey:process.env.RIOT_API_KEY!});
    const results:Record<string,number>={};
    for(const candidate of candidates) {
      const result=await recoverCandidate(db,riot,candidate,info);
      results[result]=(results[result]??0)+1;
      console.log(JSON.stringify({processed:Object.values(results).reduce((a,b)=>a+b,0),results}));
      if(candidate!==candidates[candidates.length-1]) await new Promise(resolve=>setTimeout(resolve,3000));
    }
  } finally { await client.end().catch(()=>{}); }
}
main().catch(()=>{
  console.error('Backfill stopped. Check arguments, existing credentials, migration 0010, catalog availability and API access. Earlier committed matches remain safe to retry. No credentials or raw errors are printed.');
  process.exitCode=1;
});
