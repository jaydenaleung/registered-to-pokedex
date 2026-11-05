/** Shapes of the generated JSON in public/data (see scripts/build-data.mjs). */

export interface SpeciesSummary {
  id: number;
  name: string;
  slug: string;
  types: string[];
  gen: number;
  genus: string;
  /** Capture rate R in [3, 255]. */
  capture: number;
  /** HP, Atk, Def, SpA, SpD, Spe */
  stats: number[];
  /** decimetres */
  height: number;
  /** hectograms */
  weight: number;
  legendary?: boolean;
  mythical?: boolean;
  baby?: boolean;
  /** Which animated pixel sprite exists: Gen V Black/White, Showdown, or none. */
  anim: "bw" | "sd" | null;
  /** Bulbagarden Archives upload path, e.g. "4/4a/0025Pikachu.png". */
  art: string;
}

export interface FlavorEntry {
  games: string[];
  text: string;
}

export interface Ability {
  name: string;
  hidden: boolean;
  description: string;
}

export interface EvoNode {
  id: number;
  name: string;
  condition: string | null;
  children: EvoNode[];
}

export interface Learnset {
  game: string;
  /** [level, moveId]; level 0 = learned on evolution */
  level: [number, number][];
  machine: number[];
  egg: number[];
  tutor: number[];
}

export interface Card {
  id: string;
  name: string;
  set: string;
  date: string;
  rarity: string | null;
  number: string;
  artist: string | null;
  /** images.pokemontcg.io path without extension, e.g. "sv8/1" */
  img?: string;
  small?: string;
  large?: string;
}

export interface SpeciesDetail {
  id: number;
  flavor: FlavorEntry[];
  abilities: Ability[];
  eggGroups: string[];
  /** Female chance in eighths, or -1 when genderless. */
  genderRate: number;
  hatchCounter: number | null;
  baseHappiness: number | null;
  growthRate: string | null;
  habitat: string | null;
  color: string | null;
  shape: string | null;
  evolution: EvoNode | null;
  moves: Learnset | null;
  cards: Card[];
}

/** [name, type, category, power, accuracy, pp] */
export type MoveInfo = [string, string, "physical" | "special" | "status", number | null, number | null, number | null];

export type MoveDict = Record<string, MoveInfo>;

export interface TypeData {
  types: { id: string; name: string }[];
  /** chart[attacking][defending] = 0 | 0.5 | 1 | 2 */
  chart: Record<string, Record<string, number>>;
}

export interface VoteTally {
  up: number;
  down: number;
}
