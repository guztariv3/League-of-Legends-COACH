import type { ChampionKit } from "@coach/knowledge";
import { championProfile } from "./profile.js";

/**
 * What your team needs from you, read from your allies' kits (the same profile the build
 * engine uses: Wiki toughness and damage ratings, ability scalings and damage types). Only
 * said when it is clear from the kits and at least three allies are known; otherwise nothing.
 */
export interface TeamNote { id: "frontline-you" | "frontline-none" | "damage-physical" | "damage-magic"; text: string; why: string }

/** A kit counts as frontline from here (0–1 toughness profile). */
export const FRONTLINE = 0.5;
/** Team damage of one type below this share is "almost none". */
export const LOW_SHARE = 0.2;

export function teamNeeds(me: ChampionKit, allies: ChampionKit[]): TeamNote[] {
  if (allies.length < 3) return [];
  const mine = championProfile(me);
  const theirs = allies.map(championProfile);
  const out: TeamNote[] = [];

  const tank = theirs.filter((p) => p.frontline >= FRONTLINE);
  if (!tank.length) {
    if (mine.frontline >= FRONTLINE) {
      out.push({
        id: "frontline-you",
        text: "You are your team's frontline",
        why: `None of ${theirs.map((p) => p.name).join(", ")} is built to take hits, so the enemy's engage will land on you or on your damage dealers: surviving the start of each fight is your job.`,
      });
    } else {
      out.push({
        id: "frontline-none",
        text: "Your team has no frontline",
        why: "No one on your team is built to take hits, so fights start on your damage dealers: stay behind your team and fight after the enemy has used its engage.",
      });
    }
  }

  // Damage mix, weighted by how much each kit is built to deal damage.
  const team = [mine, ...theirs];
  const weight = team.reduce((s, p) => s + p.offense, 0) || 1;
  const magic = team.reduce((s, p) => s + p.damage.magic * p.offense, 0) / weight;
  const physical = team.reduce((s, p) => s + p.damage.physical * p.offense, 0) / weight;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  if (magic < LOW_SHARE) {
    out.push({
      id: "damage-physical",
      text: `Your team deals almost only physical damage (${pct(magic)} magic)`,
      why: "Every point of armor an enemy builds reduces almost all of your team's damage; armor penetration keeps your damage useful.",
    });
  } else if (physical < LOW_SHARE) {
    out.push({
      id: "damage-magic",
      text: `Your team deals almost only magic damage (${pct(physical)} physical)`,
      why: "Every point of magic resist an enemy builds reduces almost all of your team's damage; magic penetration keeps your damage useful.",
    });
  }
  return out;
}
