import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { generateHistory, SYNTHETIC_ITEMS } from '@coach/synthetic';
import { openDatabase, schema, type Database } from '../db/index.js';
import { statRows, type StatKind } from './aggregate.js';
import { recordGame } from './store.js';
import { backfillCandidates, enrichMatch, recoverCandidate, ENRICHMENT_KINDS } from './backfill.js';

let opened:Database;
let admin:pg.Client|undefined;
let testDatabase:string|undefined;
let testUrl:string|undefined;
const game=generateHistory({seed:11,puuid:'backfill-test',gameName:'Test',tagLine:'T1',platform:'EUW1',count:40,now:Date.UTC(2026,8,20)}).find(g=>g.scenario==='normal' && g.timeline && g.match.info.queueId===420)!;
const completed=new Set(SYNTHETIC_ITEMS.map(i=>i.id));
const extracted=statRows(game.match,game.timeline,completed);
const candidate={matchId:game.match.metadata.matchId,platform:'EUW1',patch:extracted.patch};
const info={patch:extracted.patch,completed};
beforeEach(async()=>{
 const configured=process.env.BACKFILL_TEST_DATABASE_URL;
 if(!configured) { opened=await openDatabase(); return; }
 const url=new URL(configured);
 // Never use DATABASE_URL or an external host for this destructive test lifecycle.
 if(!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname!=='/postgres') throw new Error('Loopback PostgreSQL test service required');
 admin=new pg.Client({connectionString:configured});
 await admin.connect();
 testDatabase=`backfill_test_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE DATABASE "${testDatabase}"`);
 url.pathname=`/${testDatabase}`;
 testUrl=url.toString();
 opened=await openDatabase(testUrl);
});
afterEach(async()=>{
 await opened?.close();
 if(admin) {
  // The application pool has been drained above. Do not force-terminate a
  // socket still finishing its graceful close: that can emit a late 57P01.
  // A genuinely leaked connection must fail cleanup instead of being hidden.
  try { if(testDatabase) await admin.query(`DROP DATABASE "${testDatabase}"`); }
  finally {await admin.end();admin=undefined;testDatabase=undefined;testUrl=undefined;}
 }
});
async function legacy() {
 await recordGame(opened.db,{...candidate,counted:true,rows:extracted.rows.filter(r=>!ENRICHMENT_KINDS.includes(r.kind) && !["purchase_path","matchup_purchase_path"].includes(r.kind))});
 // Simulate a pre-migration historical game: no per-match enrichment provenance.
 await opened.db.delete(schema.statsEnrichments);
}
it('previews without writing, enriches only new categories, and is idempotent under competing retries',async()=>{
 await legacy();
 const old=await opened.db.select().from(schema.statsCounts);
 expect(await backfillCandidates(opened.db,candidate.patch,10)).toEqual([candidate]);
 expect(await opened.db.select().from(schema.statsEnrichments)).toEqual([]);
 const results=await Promise.all([enrichMatch(opened.db,candidate,game.match,game.timeline!,info),enrichMatch(opened.db,candidate,game.match,game.timeline!,info)]);
 expect(results.sort()).toEqual(['already-covered','enriched']);
 const all=await opened.db.select().from(schema.statsCounts);
 expect(all.filter(r=>!ENRICHMENT_KINDS.includes(r.kind as StatKind))).toEqual(old);
 expect(all.filter(r=>ENRICHMENT_KINDS.includes(r.kind as StatKind)).length).toBeGreaterThan(0);
 expect(await backfillCandidates(opened.db,candidate.patch,10)).toEqual([]);
});
it('marks live collection atomically so the backfill cannot count a new match twice',async()=>{
 await recordGame(opened.db,{...candidate,counted:true,rows:extracted.rows});
 const before=await opened.db.select().from(schema.statsCounts);
 expect(await enrichMatch(opened.db,candidate,game.match,game.timeline!,info)).toBe('already-covered');
 expect(await opened.db.select().from(schema.statsCounts)).toEqual(before);
});
it('keeps missing timelines retryable and rejects a different match or patch',async()=>{
 await legacy();
 expect(await recoverCandidate(opened.db,{getMatch:async()=>game.match,getTimeline:async()=>null},candidate,info)).toBe('unavailable');
 expect(await enrichMatch(opened.db,candidate,game.match,{...game.timeline!,metadata:{...game.timeline!.metadata,matchId:'other'}},info)).toBe('mismatch');
 expect(await enrichMatch(opened.db,candidate,game.match,game.timeline!,{...info,patch:'0.0'})).toBe('mismatch');
 expect(await backfillCandidates(opened.db,candidate.patch,10)).toHaveLength(1);
});
it('rolls back the claim and counters if a write fails, then permits a retry',async()=>{
 await legacy();
 await opened.db.execute(sql`ALTER TABLE stats_counts ADD CONSTRAINT fail_enrichment CHECK (kind NOT LIKE 'matchup_%')`);
 const before=await opened.db.select().from(schema.statsCounts);
 await expect(enrichMatch(opened.db,candidate,game.match,game.timeline!,info)).rejects.toThrow();
 expect(await opened.db.select().from(schema.statsCounts)).toEqual(before);
 expect(await opened.db.select().from(schema.statsEnrichments)).toEqual([]);
 await opened.db.execute(sql`ALTER TABLE stats_counts DROP CONSTRAINT fail_enrichment`);
 expect(await enrichMatch(opened.db,candidate,game.match,game.timeline!,info)).toBe('enriched');
});
it('does not enrich historical games explicitly marked ambiguous',async()=>{
 await legacy();
 await opened.db.insert(schema.statsEnrichments).values({matchId:candidate.matchId,status:'legacy_unknown'});
 expect(await backfillCandidates(opened.db,candidate.patch,10)).toEqual([]);
 expect(await enrichMatch(opened.db,candidate,game.match,game.timeline!,info)).toBe('already-covered');
 await opened.db.delete(schema.statsMatches).where(eq(schema.statsMatches.matchId,candidate.matchId));
 expect(await opened.db.select().from(schema.statsEnrichments)).toEqual([]);
});

it('migration blocks ambiguous patches while leaving clean historical patches eligible',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {readFileSync}=await import('node:fs');
 const client=new PGlite();
 try {
  await client.exec(readFileSync(new URL('../db/migrations/0007_champion_stats.sql',import.meta.url),'utf8'));
  await client.exec(`INSERT INTO stats_matches(match_id,platform,patch,counted) VALUES
    ('old-ambiguous','EUW1','16.18',true),('old-clean','EUW1','16.19',true);
    INSERT INTO stats_counts(patch,champion,position,kind,key,games,wins) VALUES
    ('16.18','Ahri','MIDDLE','rune_page','page',1,1),
    ('16.19','Ahri','MIDDLE','games','',100,50);`);
  await client.exec(readFileSync(new URL('../db/migrations/0010_stats_enrichment.sql',import.meta.url),'utf8'));
  expect((await client.query('SELECT match_id,status FROM stats_enrichments')).rows).toEqual([{match_id:'old-ambiguous',status:'legacy_unknown'}]);
 } finally {await client.close();}
});


it.skipIf(!process.env.BACKFILL_TEST_DATABASE_URL)('PostgreSQL CLI preview is read-only without a Riot key',async()=>{
 await legacy();
 const before=await opened.db.select().from(schema.statsCounts);
 const {stdout}=await promisify(execFile)(process.execPath,['--import','tsx','src/stats/backfill-cli.ts',candidate.patch,'10','--preview'],{
  cwd:fileURLToPath(new URL('../../',import.meta.url)),
  env:{...process.env,DATABASE_URL:testUrl!,RIOT_API_KEY:''},timeout:20000,
 });
 expect(JSON.parse(stdout.trim())).toMatchObject({mode:'--preview',selected:1});
 expect(await opened.db.select().from(schema.statsCounts)).toEqual(before);
 expect(await opened.db.select().from(schema.statsEnrichments)).toEqual([]);
});
