import type { TypeData } from "./types";

export const TYPE_COLORS: Record<string, string> = {
  normal: "#a8a77a",
  fire: "#ee8130",
  water: "#6390f0",
  electric: "#e6b800",
  grass: "#5fbd3a",
  ice: "#78d0d0",
  fighting: "#c22e28",
  poison: "#a33ea1",
  ground: "#d6b35a",
  flying: "#a98ff3",
  psychic: "#f95587",
  bug: "#a6b91a",
  rock: "#b6a136",
  ghost: "#735797",
  dragon: "#6f35fc",
  dark: "#705746",
  steel: "#9a9ab8",
  fairy: "#d685ad",
};

export const TYPE_IDS = Object.keys(TYPE_COLORS);

/** Damage multiplier of an attacking type against a (one- or two-typed) defender. */
export function multiplier(attacking: string, defending: string[], chart: TypeData["chart"]): number {
  return defending.reduce((m, def) => m * (chart[attacking]?.[def] ?? 1), 1);
}

export interface DefensiveProfile {
  quad: string[];
  double: string[];
  half: string[];
  quarter: string[];
  immune: string[];
}

/** Groups every attacking type by how much damage it deals to the given types. */
export function defensiveProfile(defending: string[], chart: TypeData["chart"]): DefensiveProfile {
  const profile: DefensiveProfile = { quad: [], double: [], half: [], quarter: [], immune: [] };
  for (const atk of Object.keys(chart)) {
    const m = multiplier(atk, defending, chart);
    if (m === 0) profile.immune.push(atk);
    else if (m >= 4) profile.quad.push(atk);
    else if (m >= 2) profile.double.push(atk);
    else if (m <= 0.25) profile.quarter.push(atk);
    else if (m <= 0.5) profile.half.push(atk);
  }
  return profile;
}

/** True when the attacking type deals at least 2× to the defender. */
export function isWeakTo(attacking: string, defending: string[], chart: TypeData["chart"]): boolean {
  return multiplier(attacking, defending, chart) >= 2;
}
