import {afterAll,afterEach,beforeAll,expect,it,vi} from 'vitest';
import {generateHistory} from '@coach/synthetic';
import {eq} from 'drizzle-orm';
import {openDatabase,schema,type Database} from './db/index.js';
import {SyncService,MAX_INCREMENTAL} from './sync.js';
import {forgetPlayers,purgeDeletedMatches} from './retention.js';
import type {MatchSource} from './sources.js';
let database:Database;
beforeAll(async()=>{database=await openDatabase();},30000);
afterAll(()=>database.close());afterEach(()=>vi.restoreAllMocks());
async function fixture(label:string,count:number){
 const initial=Date.UTC(2026,9,1,12);let now=initial;
 vi.spyOn(Date,'now').mockImplementation(()=>now);
 const template=generateHistory({seed:42,puuid:label,gameName:label,tagLine:'TEST',platform:'euw1',count:1,now:initial})[0]!.match;
 const games=Array.from({length:count},(_,i)=>({...template,metadata:{...template.metadata,matchId:`EUW1_${label}_${i}`},info:{...template.info,gameCreation:initial-(i+1)*60000}}));
 const calls:{start:number;end?:number}[]=[];let fail:string|undefined;
 const source:MatchSource={kind:'synthetic',resolveAccount:async()=>null,activeGame:async()=>null,
  async matchIds(_platform,_puuid,n,start,lower,end){calls.push({start,end});return games.filter(g=>(lower===undefined||g.info.gameCreation>=lower*1000)&&(end===undefined||g.info.gameCreation<=end*1000)).slice(start,start+n).map(g=>g.metadata.matchId);},
  async match(_platform,id){if(id===fail){fail=undefined;throw Error('retry this match');}return games.find(g=>g.metadata.matchId===id)??null;},timeline:async()=>null};
 const [user]=await database.db.insert(schema.users).values({displayName:label}).returning();
 const [account]=await database.db.insert(schema.riotAccounts).values({userId:user!.id,puuid:label,gameName:label,tagLine:'TEST',platform:'euw1',source:'synthetic',lastSyncedAt:new Date(initial-86400000)}).returning();
 return {account:account!,source,calls,initial,games,setNow:(n:number)=>{now=n;},failOn:(id:string)=>{fail=id;},
  row:async()=>(await database.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id,account!.id)))[0]!,
  linked:async()=>(await database.db.select().from(schema.accountMatches).where(eq(schema.accountMatches.accountId,account!.id))).map(x=>x.matchId)};
}
it('drains 410 games across restarts with a fixed window and then picks up new games',async()=>{
 const f=await fixture('backlog',410);
 await new SyncService(database.db,f.source).start(f.account.id);
 expect(await f.linked()).toHaveLength(MAX_INCREMENTAL);
 expect((await f.row()).lastSyncedAt).toEqual(f.account.lastSyncedAt);
 expect((await f.row()).syncOffset).toBe(300);
 expect(f.calls).toHaveLength(3);
 const newGame={...f.games[0]!,metadata:{...f.games[0]!.metadata,matchId:'EUW1_new_during_backlog'},info:{...f.games[0]!.info,gameCreation:f.initial+3600000}};
 f.games.unshift(newGame);f.setNow(f.initial+7200000);
 await new SyncService(database.db,f.source).start(f.account.id);
 expect(await f.linked()).toHaveLength(410);
 expect((await f.row()).lastSyncedAt).toEqual(new Date(f.initial));
 expect((await f.row()).syncOffset).toBe(0);
 expect(f.calls.every(c=>c.end===f.initial/1000)).toBe(true);
 await new SyncService(database.db,f.source).start(f.account.id);
 expect(await f.linked()).toHaveLength(411);
 expect(await f.linked()).toContain(newGame.metadata.matchId);
},60000);
it('retries gaps behind known games without advancing the failed cursor or watermark',async()=>{
 const f=await fixture('retry',120);f.failOn(f.games[60]!.metadata.matchId);
 await new SyncService(database.db,f.source).start(f.account.id);
 expect((await f.row()).syncStatus).toBe('error');expect(await f.linked()).toHaveLength(60);
 expect((await f.row()).lastSyncedAt).toEqual(f.account.lastSyncedAt);
 expect((await f.row()).syncOffset).toBe(0);
 f.setNow(f.initial+7200000);
 await new SyncService(database.db,f.source).start(f.account.id);
 expect((await f.row()).syncStatus).toBe('ok');expect(await f.linked()).toHaveLength(120);
 expect((await f.row()).lastSyncedAt).toEqual(new Date(f.initial));
},60000);
it('waits for active writes before deleting and blocks a new sync during deletion',async()=>{
 const f=await fixture('delete-active',1);
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
 const original=f.source.match;
 f.source.match=async(...args)=>{entered();await gate;return original(...args);};
 const sync=new SyncService(database.db,f.source);
 const running=sync.start(f.account.id);await started;
 let removed=false;
 const deletion=sync.withDeletion([f.account.id],async()=>{
  expect(await f.linked()).toHaveLength(1);
  const calls=f.calls.length;await sync.start(f.account.id);expect(f.calls).toHaveLength(calls);
  await database.db.delete(schema.riotAccounts).where(eq(schema.riotAccounts.id,f.account.id));removed=true;
 });
 await Promise.resolve();expect(removed).toBe(false);release();await Promise.all([running,deletion]);
 expect(removed).toBe(true);expect(await f.row()).toBeUndefined();
},30000);
it('startup reanalysis waits for deletion and never recreates a deleted player analyses',async()=>{
 const f=await fixture('reanalysis-delete',1);
 const sync=new SyncService(database.db,f.source);
 await sync.start(f.account.id);
 const [matchId]=await f.linked();
 // Another account keeps the raw match, so the foreign key would accept a late analysis.
 const [other]=await database.db.insert(schema.users).values({displayName:'reanalysis-keeper'}).returning();
 const [keeper]=await database.db.insert(schema.riotAccounts).values({userId:other!.id,puuid:'reanalysis-keeper',gameName:'keeper',tagLine:'TEST',platform:'euw1',source:'synthetic'}).returning();
 await database.db.insert(schema.accountMatches).values({accountId:keeper!.id,matchId:matchId!,startedAt:new Date(f.initial)});
 const analyses=async()=>database.db.select().from(schema.matchAnalyses).where(eq(schema.matchAnalyses.puuid,'reanalysis-delete'));
 // An analysis version bump leaves this player's current analysis missing at startup.
 await database.db.delete(schema.matchAnalyses).where(eq(schema.matchAnalyses.puuid,'reanalysis-delete'));
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
 const proto=SyncService.prototype as unknown as {reanalyze:(a:{id:string})=>Promise<void>};
 const original=proto.reanalyze;
 vi.spyOn(proto,'reanalyze').mockImplementation(async function(this:unknown,account){
  if(account.id===f.account.id){entered();await gate;}
  return original.call(this,account);
 });
 const startup=sync.reanalyzeAll();await started;
 let removed=false;
 const deletion=sync.withDeletion([f.account.id],()=>database.db.transaction(async tx=>{
  await tx.delete(schema.riotAccounts).where(eq(schema.riotAccounts.id,f.account.id));
  await forgetPlayers(tx,['reanalysis-delete']);
  await purgeDeletedMatches(tx,[matchId!]);
  removed=true;
 }));
 for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,5));
 expect(removed).toBe(false);
 release();await Promise.all([startup,deletion]);
 expect(removed).toBe(true);
 expect(await analyses()).toHaveLength(0);
 // A reanalysis started after deletion skips the account entirely.
 await sync.reanalyzeAll();
 expect(await analyses()).toHaveLength(0);
},30000);
