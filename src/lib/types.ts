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
  /** Tags of alternate forms: "alola" | "galar" | "hisui" | "paldea" | "mega" | "primal" | "gmax" | "other". */
  forms?: string[];
}

export type FormKind = "regional" | "mega" | "primal" | "gmax" | "other";

/** An alternate form (Pokémon variety) from public/data/forms.json. */
export interface FormSummary {
  /** PokeAPI pokemon id (10001+). */
  pid: number;
  /** National Dex number of the species. */
  species: number;
  name: string;
  label: string;
  kind: FormKind;
  types: string[];
  stats: number[];
  height: number;
  weight: number;
  anim: "bw" | "sd" | null;
  /** Has a Gen V-style static sprite. */
  bw?: boolean;
  battleOnly?: boolean;
}

export interface FormDetail {
  pid: number;
  abilities: Ability[];
  moves: Learnset | null;
  cards: Card[];
}

/** Anything that can be drawn: a species (pid = National Dex no.) or a form. */
export interface Mon {
  pid: number;
  species: number;
  name: string;
  types: string[];
  stats: number[];
  height: number;
  weight: number;
  anim: "bw" | "sd" | null;
  bw?: boolean;
  form?: FormSummary;
}

/** A game whose sprites, cries and Pokédex text can skin the whole Pokédex. */
export interface GameDef {
  id: string;
  name: string;
  gen: number;
  year: number;
  /** PokeAPI version names whose Pokédex entries belong to this game. */
  versions: string[];
  /** Directory under sprites/pokemon/versions. */
  front: string;
  ext: string;
  /** [[from, to], …] of pokemon ids with a front sprite. */
  ids: [number, number][];
  cry: "legacy" | "latest";
  back?: string;
  backExt?: string;
  backIds?: [number, number][];
  anim?: string;
  animExt?: string;
  animIds?: [number, number][];
  animBack?: string;
  animBackIds?: [number, number][];
  icon?: string;
  iconIds?: [number, number][];
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
  /** Name of the default form when it has one (e.g. "Normal Forme"). */
  formLabel?: string;
  forms?: FormDetail[];
}

/** Battle metadata for a move (from PokeAPI move_meta; keys omitted when zero). */
export interface MoveBattleMeta {
  /** meta category: 0 damage, 1 ailment, 2 net-good-stats, 3 heal, 4 damage+ailment, 6 damage+lower, 7 damage+raise, 8 damage+heal, 9 ohko … */
  c?: number;
  /** ailment: 1 paralysis, 2 sleep, 3 freeze, 4 burn, 5 poison */
  a?: number;
  /** ailment chance % (0 = always for status moves) */
  ac?: number;
  /** [min, max] hits */
  h?: [number, number];
  /** drain % of damage (negative = recoil) */
  d?: number;
  /** heal % of max HP */
  hl?: number;
  /** crit stage bonus */
  cr?: number;
  /** flinch chance % */
  f?: number;
  /** stat-change chance % */
  sc?: number;
  /** [[statId, change]] (2 atk, 3 def, 4 spa, 5 spd, 6 spe) */
  s?: [number, number][];
  /** targets the user */
  self?: 1;
  /** special damage rule */
  fx?: string;
  /** two-turn behaviour: "charge" first, "recharge" after, or "focus" (Focus Punch) */
  tt?: "charge" | "recharge" | "focus";
}

/** [name, type, category, power, accuracy, pp, priority, battle meta] */
export type MoveInfo = [
  string,
  string,
  "physical" | "special" | "status",
  number | null,
  number | null,
  number | null,
  number?,
  MoveBattleMeta?,
];

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
