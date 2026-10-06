import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {openDatabase,schema,type Database} from './db/index.js';
import {forgetPlayers,purgeDeletedMatches} from './retention.js';

/**
 * Two accounts are the last ones sharing a match and are deleted at the same time. Each
 * transaction removes its own link while the other's removal is still uncommitted; without
 * serialisation both see the other link, skip the cleanup and leave the match orphaned.
 * Needs real concurrent transactions, so it runs only against the CI PostgreSQL service.
 */
const configured=process.env.BACKFILL_TEST_DATABASE_URL;
let opened:Database|undefined;
let admin:pg.Client|undefined;
let testDatabase:string|undefined;
beforeEach(async()=>{
 if(!configured)return;
 const url=new URL(configured);
 // Never use DATABASE_URL or an external host for this destructive test lifecycle.
 if(!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname!=='/postgres') throw new Error('Loopback PostgreSQL test service required');
 admin=new pg.Client({connectionString:configured});
 await admin.connect();
 testDatabase=`deletion_race_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE DATABASE "${testDatabase}"`);
 url.pathname=`/${testDatabase}`;
 opened=await openDatabase(url.toString());
});
afterEach(async()=>{
 await opened?.close();opened=undefined;
 if(admin){
  try { if(testDatabase) await admin.query(`DROP DATABASE "${testDatabase}"`); }
  finally { await admin.end();admin=undefined;testDatabase=undefined; }
 }
});

it.skipIf(!configured)('concurrent deletion of the last two accounts sharing a match still removes it',async()=>{
 const db=opened!.db;
 const matchId='EUW1_shared_race';
 await db.insert(schema.rawMatches).values({matchId,platform:'euw1',source:'synthetic',payload:{}});
 await db.insert(schema.rawTimelines).values({matchId,payload:{}});
 const accounts:(typeof schema.riotAccounts.$inferSelect)[]=[];
 for(const label of ['race-a','race-b']){
  const [user]=await db.insert(schema.users).values({displayName:label}).returning();
  const [account]=await db.insert(schema.riotAccounts).values({userId:user!.id,puuid:label,gameName:label,tagLine:'TEST',platform:'euw1',source:'synthetic'}).returning();
  await db.insert(schema.accountMatches).values({accountId:account!.id,matchId,startedAt:new Date()});
  await db.insert(schema.matchAnalyses).values({matchId,puuid:label,analysisVersion:1,data:{}});
  accounts.push(account!);
 }
 // Both transactions delete their own link before either one evaluates what is left.
 let arrived=0;let release!:()=>void;const bothDeleted=new Promise<void>(r=>{release=r;});
 const remove=(account:typeof accounts[number])=>db.transaction(async tx=>{
  await tx.delete(schema.riotAccounts).where(eq(schema.riotAccounts.id,account.id));
  if(++arrived===2)release();
  await bothDeleted;
  await forgetPlayers(tx,[account.puuid]);
  await purgeDeletedMatches(tx,[matchId]);
 });
 await Promise.all(accounts.map(remove));
 expect(await db.select().from(schema.accountMatches).where(eq(schema.accountMatches.matchId,matchId))).toHaveLength(0);
 expect(await db.select().from(schema.matchAnalyses).where(eq(schema.matchAnalyses.matchId,matchId))).toHaveLength(0);
 expect(await db.select().from(schema.rawTimelines).where(eq(schema.rawTimelines.matchId,matchId))).toHaveLength(0);
 expect(await db.select().from(schema.rawMatches).where(eq(schema.rawMatches.matchId,matchId))).toHaveLength(0);
},30000);
