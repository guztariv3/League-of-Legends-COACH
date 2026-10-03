import { expect, test } from "@playwright/test";
import type { LiveFrame, LiveDetail } from "@coach/ui";

test("private Live renders shared advice and hides it on pause, reconnect and stale data",async({page},info)=>{
 const player=`Live${info.project.name}`;
 let frame:LiveFrame|null={version:1,streamId:"0d400d84-a7b4-46c2-a4e6-f019a772186f",sequence:1,capturedAt:Date.now(),phase:"live",champion:"Ahri",position:"MIDDLE",patch:"16.19.1",time:600,gold:850,allies:["LeeSin"],enemies:["Zed"],headline:"Shared desktop decision",sections:[{title:"What matters now",primary:true,lines:["Stay behind your minion wave."]},{title:"Equipped runes and summoner spells",lines:["Electrocute","Flash + Ignite"]}]};
 let stale=false;
 let sharing=false;
 let limited=false, calls=0;
 await page.route("**/api/live",route=>{calls++;return limited ? route.fulfill({status:429,json:{error:"rate_limited"}}) : route.fulfill({json:{frame:sharing?frame:null,stale,expiresInMs:sharing&&frame&&!stale ? 12000:null}});});
 await page.goto("/");
 await page.getByText("Development sign-in (private prototype only)").click();
 await page.getByLabel("Your name").fill(player);
 await page.getByRole("button",{name:"Sign in with a name"}).click();
 await page.getByLabel("Riot ID").fill(`${player}#EUW`);
 await page.getByRole("button",{name:"Link and analyze"}).click();
 await expect(page.getByText(/Based on \d+ analyzable games/)).toBeVisible({timeout:30000});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
 sharing=true;
 await page.getByRole("navigation",{name:"Main"}).getByRole("link",{name:"Live",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Shared desktop decision"})).toBeVisible();
 await expect(page.getByText("Stay behind your minion wave.")).toBeVisible();
 await page.getByText("Equipped runes and summoner spells",{exact:true}).click();
 await expect(page.getByText("Flash + Ignite",{exact:true})).toBeVisible();
 // New structured payload must render both views without exposing unavailable history.
 const playerCard={champion:"Ahri",name:"Test summoner",role:"MIDDLE",level:9,kills:2,deaths:1,assists:4,cs:85,items:[1052],isMe:true,rank:null,history:[]};
 const detail:LiveDetail={source:"contextual",players:{allies:[playerCard],enemies:[{...playerCard,champion:"Zed",name:"Opponent",isMe:false}]},
 buyNow:[{id:1026,name:"Blasting Wand",gold:850,targetName:"Morellonomicon",reason:"Advances your current target."}],spent:850,leftover:0,deferred:[],
 recipes:[{id:3165,name:"Morellonomicon",gold:2950,remaining:2550,owned:false,children:[{id:1052,name:"Amplifying Tome",gold:400,remaining:0,owned:true,children:[]}]}],
 targets:[{id:3165,name:"Morellonomicon",remaining:2550,at:900}],starter:[],alternatives:[],runes:[{id:8112,name:"Electrocute",why:"Short trades",group:"Domination"}],spells:[],equippedRunes:[],equippedSpells:[],skillOrder:["Q","W","E"],skillSequence:[1,2,3,1,1,4,1,2,1,2,4,2,2,3,3,4,3,3],skillRanks:[5,1,1,1],nextSkill:null,teamNotes:[],enemyNotes:[],playerNotes:[],damage:null};
 frame={...frame,detail};
 await expect(page.getByRole("tab",{name:"Recommended Build"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Purchase order",exact:true})).toBeVisible();
 await expect(page.getByText("Blasting Wand",{exact:true})).toBeVisible();
 await expect(page.getByText("Owned",{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
 await page.screenshot({path:`test-results/live-build-${info.project.name}.png`,fullPage:true});
 await page.getByRole("tab",{name:"Summoner Insights"}).click();
 await expect(page.getByText("Test summoner · You",{exact:true})).toBeVisible();
 await expect(page.getByText("Rank unavailable",{exact:true})).toHaveCount(2);
 await page.screenshot({path:`test-results/live-teams-${info.project.name}.png`,fullPage:true});
 // Even a frame containing old sections must not expose advice while blocked.
 frame={...frame,phase:"paused",headline:"Coach paused"};
 await expect(page.getByRole("heading",{name:"Coach paused"})).toBeVisible();
 await expect(page.getByText("Stay behind your minion wave.")).toHaveCount(0);
 await expect(page.getByRole("tab",{name:"Recommended Build"})).toHaveCount(0);
 frame={...frame,phase:"reconnecting",headline:"Waiting for fresh game data"};
 await expect(page.getByRole("heading",{name:"Waiting for fresh game data"})).toBeVisible();
 await expect(page.getByText("Stay behind your minion wave.")).toHaveCount(0);
 await expect(page.getByRole("tab",{name:"Recommended Build"})).toHaveCount(0);
 // Too many requests is not a lost companion: what is shown stays, and the page backs off.
 frame={...frame,phase:"live",headline:"Shared desktop decision"};
 await expect(page.getByRole("heading",{name:"Shared desktop decision"})).toBeVisible();
 limited=true;
 const before=calls;
 await page.waitForTimeout(4000);
 expect(calls-before).toBeLessThanOrEqual(1); // one 429, then a 10 s pause instead of every second
 await expect(page.getByRole("heading",{name:"Shared desktop decision"})).toBeVisible();
 await expect(page.getByText(/companion connection is stale/)).toHaveCount(0);
 // Still limited: the retained advice expires when the API said it would (12 s here), not later.
 await expect(page.getByText(/companion connection is stale/)).toBeVisible({timeout:13000});
 await expect(page.getByText("Shared desktop decision")).toHaveCount(0);
 limited=false;
 frame=null;stale=true;
 await expect(page.getByText(/companion connection is stale/)).toBeVisible({timeout:15000});
 await expect(page.getByText("Shared desktop decision")).toHaveCount(0);
});
