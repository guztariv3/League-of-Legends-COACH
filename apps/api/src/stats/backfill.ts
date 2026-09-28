import { and, eq, isNull, sql } from 'drizzle-orm';
import type { RawMatch, RawTimeline } from '@coach/domain';
import { schema, type Db } from '../db/index.js';
import { statRows, type StatKind } from './aggregate.js';
import type { StatsRiot, PatchInfo } from './crawler.js';

export const ENRICHMENT_KINDS: StatKind[] = ['matchup_first_item','matchup_core','rune_page','matchup_rune_page','matchup_spells'];
export interface BackfillCandidate { matchId:string; platform:string; patch:string }

/** Preview only; callers must use an already migrated database. */
export async function backfillCandidates(db:Db, patch:string, limit:number):Promise<BackfillCandidate[]> {
  if(!/^\d+\.\d+$/.test(patch) || !Number.isInteger(limit) || limit<1 || limit>20) throw new Error('Invalid bounded backfill request');
  const m=schema.statsMatches, e=schema.statsEnrichments;
  return db.select({matchId:m.matchId,platform:m.platform,patch:m.patch}).from(m)
    .leftJoin(e,eq(e.matchId,m.matchId))
    .where(and(eq(m.patch,patch),eq(m.counted,true),isNull(e.matchId)))
    .orderBy(m.processedAt,m.matchId).limit(limit);
}

/** The claim and new-category increments commit together; old counters never change. */
export async function enrichMatch(db:Db, candidate:BackfillCandidate, match:RawMatch, timeline:RawTimeline, info:PatchInfo) {
  if(match.metadata.matchId!==candidate.matchId || timeline.metadata.matchId!==candidate.matchId || info.patch!==candidate.patch) return 'mismatch' as const;
  const extracted=statRows(match,timeline,info.completed);
  if(extracted.patch!==candidate.patch || !extracted.rows.some(r=>r.kind==='games')) return 'mismatch' as const;
  return db.transaction(async tx=>{
    // Lock the retained parent so retention cannot remove it between checking and claiming.
    const m=schema.statsMatches;
    const [stored]=await tx.select().from(m).where(eq(m.matchId,candidate.matchId)).for('update');
    if(!stored || !stored.counted || stored.patch!==candidate.patch || stored.platform!==candidate.platform) return 'mismatch' as const;
    const claimed=await tx.insert(schema.statsEnrichments).values({matchId:candidate.matchId,status:'complete'})
      .onConflictDoNothing().returning({id:schema.statsEnrichments.matchId});
    if(!claimed.length) return 'already-covered' as const;
    const c=schema.statsCounts;
    for(const r of extracted.rows.filter(r=>ENRICHMENT_KINDS.includes(r.kind))) {
      const value={patch:candidate.patch,champion:r.champion,position:r.position,kind:r.kind,key:r.key,
        games:1,wins:r.win?1:0,minuteSum:r.minute??0,minuteN:r.minute===null?0:1};
      await tx.insert(c).values(value).onConflictDoUpdate({
        target:[c.patch,c.champion,c.position,c.kind,c.key],
        set:{games:sql`${c.games}+1`,wins:sql`${c.wins}+${value.wins}`,
          minuteSum:sql`${c.minuteSum}+${value.minuteSum}`,minuteN:sql`${c.minuteN}+${value.minuteN}`}
      });
    }
    return 'enriched' as const;
  });
}

/** Missing responses remain retryable; API exceptions abort the bounded run. */
export async function recoverCandidate(db:Db, riot:Pick<StatsRiot,'getMatch'|'getTimeline'>, candidate:BackfillCandidate, info:PatchInfo) {
  const match=await riot.getMatch(candidate.platform,candidate.matchId);
  if(!match) return 'unavailable' as const;
  const timeline=await riot.getTimeline(candidate.platform,candidate.matchId);
  if(!timeline) return 'unavailable' as const;
  return enrichMatch(db,candidate,match,timeline,info);
}
