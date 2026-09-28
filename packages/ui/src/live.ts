/** Display-only protocol: the web never independently recalculates advice. No local credentials. */
export interface LiveSection { title: string; lines: string[]; primary?: boolean }
export interface LiveFrame {
  version: 1; streamId: string; sequence: number; capturedAt: number;
  phase: "idle" | "draft" | "pregame" | "loading" | "live" | "paused" | "reconnecting" | "ended";
  champion: string | null; position: string | null; patch: string | null; time: number | null; gold: number | null;
  detail?: LiveDetail;
  allies: string[]; enemies: string[]; headline: string; sections: LiveSection[];
}
export interface DraftReadView {
 champion: string; teamFit: string; versus: string; advantage: string; concern: string; matchup: string; coverage: string; evidence: string[]; unknown: string[];
}

export interface LiveItem { id:number; name:string; gold:number; reason?:string; targetId?:number; targetName?:string }
export interface LiveRecipe { id:number; name:string; gold:number; remaining:number; owned:boolean; children:LiveRecipe[] }
export interface LivePlayerView { spells?:string[]; runes?:{id:number;name:string}[]; champion:string; name:string|null; role:string|null; level:number|null; kills:number|null; deaths:number|null; assists:number|null; cs:number|null; items:number[]; isMe:boolean; rank:string|null; history:string[] }
export interface LiveDetail {
  source: "contextual" | "limited" | "synthetic";
  players: { allies:LivePlayerView[]; enemies:LivePlayerView[] };
  buyNow:LiveItem[]; spent:number; leftover:number|null; deferred:string[];
  recipes:LiveRecipe[]; targets:{id:number;name:string;remaining:number;at:number|null}[];
  starter:LiveItem[]; alternatives:LiveItem[];
  runes:{id:number;name:string;why:string;group:string}[];
  spells:{name:string;key:number|null;why:string}[];
  equippedRunes:{id:number;name:string}[]; equippedSpells:string[];
  skillOrder:string[]; skillSequence:number[]; skillRanks:number[]; nextSkill:string|null;
  teamNotes:string[]; enemyNotes:string[]; playerNotes:string[];
  damage:{physical:number;magic:number;true:number}|null;
}
