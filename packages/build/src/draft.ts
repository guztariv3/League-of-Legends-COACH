import type { ChampionKit } from "@coach/knowledge";
import { championProfile } from "./profile.js";
import { enemyPicture } from "./threats.js";

export interface DraftRead {
  champion: string; teamFit: string; versus: string; advantage: string; concern: string;
  matchup: string; coverage: string; evidence: string[]; unknown: string[];
}
/** A provisional pick is evaluated against revealed kits, never against hidden players. */
export function draftRead(me: ChampionKit, allies: ChampionKit[], enemies: ChampionKit[], opponent?: string): DraftRead {
  const p = championProfile(me), friends = allies.map(championProfile);
  const threats = enemyPicture(enemies.map(kit => ({ kit, laneOpponent: kit.id === opponent })));
  const cc = (k: ChampionKit) => k.abilities.filter(a => /\b(stun|root|airborne|knockback|knock up|suppress|charm|taunt|fear)\b/i.test(a.text));
  const controls = cc(me);
  const missingFront = friends.length >= 2 && !friends.some(f => f.frontline >= .5);
  const magicGap = friends.length >= 2 && friends.every(f => f.damage.magic < .3);
  const physicalGap = friends.length >= 2 && friends.every(f => f.damage.physical < .3);
  const addsDamage = magicGap && p.damage.magic >= .5 || physicalGap && p.damage.physical >= .5;
  const addsCC = friends.length >= 2 && !allies.some(k => cc(k).length) && controls.length > 0;
  const protectsAllies = (k: ChampionKit) => k.abilities.some(a => /(?:shield|heal).{0,55}(?:allies|an ally)|(?:allies|an ally).{0,55}(?:shield|heal)/i.test(a.text));
  const mechanics = (k:ChampionKit) => {
    const text=k.abilities.map(a=>`${a.slot}: ${a.text}`).join(" ");
    const found:string[]=[];
    if(cc(k).length)found.push(`control (${cc(k).map(a=>a.slot).join("/")})`);
    if(/\b(dash(?:es)?|blink|leaps?)\b/i.test(text))found.push("mobility described in the kit");
    if(/\b(knock(?:s)? back|knockback|push(?:es)? away|disengage)\b/i.test(text))found.push("displacement that may help disengage");
    if(protectsAllies(k))found.push("ally protection");
    if(/permanent|infinitely|infinite|per stack/i.test(text))found.push("stacking mechanic (conditions matter)");
    return `${k.name}: ${found.join(", ") || "no detailed composition signals verified"}.`;
  };
  const strongest = Object.values(threats.threats).filter(t => t.weight >= .2).sort((a,b) => b.weight-a.weight)[0];
  const advantage = missingFront && p.frontline >= .5 ? `${me.name} adds durability to the revealed lineup.`
    : addsDamage ? `${me.name} broadens the team's damage profile.`
    : addsCC ? `${me.name} adds control through ${controls.map(a => a.slot).join(" / ")}.`
    : protectsAllies(me) ? `${me.name} offers healing or shielding for allies.`
    : p.facts[0] ?? `The available kit data is insufficient to identify a distinctive advantage.`;
  const concern = missingFront && p.frontline < .5 ? "The revealed lineup still lacks a clear frontline. Later picks could address this."
    : strongest ? `${strongest.sources.map(s => s.name).join(", ")} bring ${strongest.kind}; the pick needs a plan for that threat.`
    : "No dominant threat is established from the revealed champions. This is not a guarantee of a safe matchup.";
  const opp = enemies.find(k => k.id === opponent);
  return {
    champion: me.id, advantage, concern,
    teamFit: allies.length ? `${advantage} This assessment uses ${allies.length} revealed allies.` : "Waiting for allied picks before judging team fit.",
    versus: strongest ? `${strongest.sources.slice(0,2).map(s => `${s.name}: ${s.why}`).join("; ")}.`
      : enemies.length ? "No strong counter signal in the available kit data yet." : "No enemy picks revealed yet.",
    matchup: opp ? `${opp.name} is the assigned comparison, not a guaranteed lane opponent. ${cc(opp).map(a => `${a.slot}: ${a.name}`).join("; ") || "No verified lane-specific interaction is available."}`
      : "Lane opponent unknown; no matchup advantage is assumed.",
    coverage: `${allies.length + 1}/5 allied champions considered; ${enemies.length}/5 enemies known.`,
    evidence: [mechanics(me), ...allies.map(mechanics), ...enemies.map(mechanics), ...p.facts.slice(0,3), ...controls.slice(0,2).map(a => `${a.slot} (${a.name}): ${a.text.slice(0,260)}`)],
    unknown: ["Kit-derived tendencies are hypotheses, not win probabilities.", "Engage, peel, scaling and early pressure require verified interactions; absent data remains unknown.", ...(me.detail !== "full" ? ["Detailed champion mechanics are unavailable; this analysis is limited."] : [])],
  };
}
