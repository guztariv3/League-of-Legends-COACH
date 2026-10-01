import { expect, test } from "@playwright/test";
import type { LiveFrame } from "@coach/ui";

test("private Live renders shared advice and hides it on pause, reconnect and stale data",async({page},info)=>{
 const player=`Live${info.project.name}`;
 let frame:LiveFrame|null={version:1,streamId:"0d400d84-a7b4-46c2-a4e6-f019a772186f",sequence:1,capturedAt:Date.now(),phase:"live",champion:"Ahri",position:"MIDDLE",patch:"16.19.1",time:600,gold:850,allies:["LeeSin"],enemies:["Zed"],headline:"Shared desktop decision",sections:[{title:"What matters now",primary:true,lines:["Stay behind your minion wave."]},{title:"Equipped runes and summoner spells",lines:["Electrocute","Flash + Ignite"]}]};
 let stale=false;
 await page.route("**/api/live",route=>route.fulfill({json:{frame,stale}}));
 await page.goto("/");
 await page.getByText("Development sign-in (private prototype only)").click();
 await page.getByLabel("Your name").fill(player);
 await page.getByRole("button",{name:"Sign in with a name"}).click();
 await page.getByLabel("Riot ID").fill(`${player}#EUW`);
 await page.getByRole("button",{name:"Link and analyze"}).click();
 await expect(page.getByText(/Based on \d+ analyzable games/)).toBeVisible({timeout:30000});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
 await page.getByRole("navigation",{name:"Main"}).getByRole("link",{name:"Live",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Shared desktop decision"})).toBeVisible();
 await expect(page.getByText("Stay behind your minion wave.")).toBeVisible();
 await page.getByText("Equipped runes and summoner spells",{exact:true}).click();
 await expect(page.getByText("Flash + Ignite",{exact:true})).toBeVisible();
 // Even a frame containing old sections must not expose advice while blocked.
 frame={...frame,phase:"paused",headline:"Coach paused"};
 await expect(page.getByRole("heading",{name:"Coach paused"})).toBeVisible();
 await expect(page.getByText("Stay behind your minion wave.")).toHaveCount(0);
 frame={...frame,phase:"reconnecting",headline:"Waiting for fresh game data"};
 await expect(page.getByRole("heading",{name:"Waiting for fresh game data"})).toBeVisible();
 await expect(page.getByText("Stay behind your minion wave.")).toHaveCount(0);
 frame=null;stale=true;
 await expect(page.getByText(/companion connection is stale/)).toBeVisible();
 await expect(page.getByText("Shared desktop decision")).toHaveCount(0);
});
