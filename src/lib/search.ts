import { isWeakTo, TYPE_IDS } from "./typeChart";
import type { SpeciesSummary, TypeData, VoteTally } from "./types";

/** Search grammar from INSTRUCTIONS.md §2.3. */

export type SortKey = "num" | "name" | "popular" | "unpopular" | "bst" | "catch" | "easy";
export type Flag = "legendary" | "mythical" | "baby";

export const SORT_LABELS: Record<SortKey, string> = {
  num: "No.",
  name: "Name",
  popular: "Popular",
  unpopular: "Unpopular",
  bst: "Base stats",
  catch: "Hardest catch",
  easy: "Easiest catch",
};

export interface ParsedQuery {
  words: string[];
  ids: number[];
  ranges: [number, number][];
  types: string[];
  gens: number[];
  flags: Flag[];
  weak: string[];
  caught: "caught" | "missing" | null;
  sort: SortKey | null;
}

const REGIONS: Record<string, number> = {
  kanto: 1,
  johto: 2,
  hoenn: 3,
  sinnoh: 4,
  unova: 5,
  kalos: 6,
  alola: 7,
  galar: 8,
  paldea: 9,
};

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };

const FLAG_WORDS: Record<string, Flag> = {
  legendary: "legendary",
  legend: "legendary",
  legendaries: "legendary",
  mythical: "mythical",
  mythic: "mythical",
  myth: "mythical",
  baby: "baby",
};

const SORT_WORDS: Record<string, SortKey> = {
  num: "num",
  number: "num",
  dex: "num",
  name: "name",
  az: "name",
  popular: "popular",
  top: "popular",
  best: "popular",
  unpopular: "unpopular",
  worst: "unpopular",
  bottom: "unpopular",
  bst: "bst",
  stats: "bst",
  strongest: "bst",
  catch: "catch",
  hardest: "catch",
  hard: "catch",
  easy: "easy",
  easiest: "easy",
};

/** Lower-case, strip accents and punctuation: "Flabébé" → "flabebe", "Mr. Mime" → "mrmime". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/♀/g, "f")
    .replace(/♂/g, "m")
    .replace(/[^a-z0-9]/g, "");
}

function parseGen(v: string): number | null {
  const lower = v.toLowerCase();
  if (/^[1-9]$/.test(lower)) return Number(lower);
  if (ROMAN[lower]) return ROMAN[lower];
  if (REGIONS[lower]) return REGIONS[lower];
  return null;
}

export function tokenize(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean);
}

export function parseQuery(q: string): ParsedQuery {
  const parsed: ParsedQuery = {
    words: [],
    ids: [],
    ranges: [],
    types: [],
    gens: [],
    flags: [],
    weak: [],
    caught: null,
    sort: null,
  };
  for (const raw of tokenize(q)) {
    const token = raw.toLowerCase();
    const kv = /^([a-z]+):(.+)$/.exec(token);
    if (kv) {
      const [, key, value] = kv;
      if (key === "type" || key === "t") {
        if (TYPE_IDS.includes(value)) parsed.types.push(value);
        continue;
      }
      if (key === "gen" || key === "g" || key === "generation" || key === "region") {
        const gen = parseGen(value);
        if (gen) parsed.gens.push(gen);
        continue;
      }
      if (key === "is") {
        if (FLAG_WORDS[value]) parsed.flags.push(FLAG_WORDS[value]);
        else if (value === "caught") parsed.caught = "caught";
        else if (value === "missing" || value === "uncaught") parsed.caught = "missing";
        continue;
      }
      if (key === "weak") {
        if (TYPE_IDS.includes(value)) parsed.weak.push(value);
        continue;
      }
      if (key === "sort" || key === "s") {
        if (SORT_WORDS[value]) parsed.sort = SORT_WORDS[value];
        continue;
      }
    }
    const idMatch = /^#?(\d{1,4})$/.exec(token);
    if (idMatch) {
      parsed.ids.push(Number(idMatch[1]));
      continue;
    }
    const range = /^#?(\d{1,4})-#?(\d{1,4})$/.exec(token);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      parsed.ranges.push([Math.min(a, b), Math.max(a, b)]);
      continue;
    }
    const genWord = /^gen(?:eration)?([1-9]|i{1,3}|iv|v|vi{0,3}|ix)$/.exec(token);
    if (genWord) {
      const gen = parseGen(genWord[1]);
      if (gen) {
        parsed.gens.push(gen);
        continue;
      }
    }
    if (REGIONS[token]) {
      parsed.gens.push(REGIONS[token]);
      continue;
    }
    if (TYPE_IDS.includes(token)) {
      parsed.types.push(token);
      continue;
    }
    if (FLAG_WORDS[token]) {
      parsed.flags.push(FLAG_WORDS[token]);
      continue;
    }
    if (token === "caught") {
      parsed.caught = "caught";
      continue;
    }
    if (token === "missing" || token === "uncaught") {
      parsed.caught = "missing";
      continue;
    }
    if (token === "popular" || token === "unpopular") {
      parsed.sort = token;
      continue;
    }
    const word = normalize(token);
    if (word) parsed.words.push(word);
  }
  return parsed;
}

export function isEmptyQuery(p: ParsedQuery): boolean {
  return (
    !p.words.length &&
    !p.ids.length &&
    !p.ranges.length &&
    !p.types.length &&
    !p.gens.length &&
    !p.flags.length &&
    !p.weak.length &&
    !p.caught &&
    !p.sort
  );
}

export interface QueryContext {
  chart?: TypeData["chart"];
  votes?: Map<number, VoteTally>;
  caught?: Set<number>;
}

export const bst = (s: SpeciesSummary) => s.stats.reduce((a, b) => a + b, 0);
export const score = (t: VoteTally | undefined) => (t ? t.up - t.down : 0);

export function applyQuery(list: SpeciesSummary[], p: ParsedQuery, ctx: QueryContext = {}): SpeciesSummary[] {
  const result = list.filter((s) => {
    const name = normalize(s.name);
    if (p.words.length && !p.words.every((w) => name.includes(w))) return false;
    if (p.ids.length || p.ranges.length) {
      const inIds = p.ids.includes(s.id);
      const inRange = p.ranges.some(([a, b]) => s.id >= a && s.id <= b);
      if (!inIds && !inRange) return false;
    }
    if (p.types.length && !p.types.every((t) => s.types.includes(t))) return false;
    if (p.gens.length && !p.gens.includes(s.gen)) return false;
    if (p.flags.length && !p.flags.some((f) => s[f])) return false;
    if (p.weak.length && ctx.chart && !p.weak.every((t) => isWeakTo(t, s.types, ctx.chart!))) return false;
    if (p.caught === "caught" && !ctx.caught?.has(s.id)) return false;
    if (p.caught === "missing" && ctx.caught?.has(s.id)) return false;
    return true;
  });

  const votes = ctx.votes ?? new Map<number, VoteTally>();
  const total = (id: number) => {
    const t = votes.get(id);
    return t ? t.up + t.down : 0;
  };
  const byId = (a: SpeciesSummary, b: SpeciesSummary) => a.id - b.id;
  switch (p.sort) {
    case "name":
      return result.sort((a, b) => a.name.localeCompare(b.name));
    case "popular":
      return result.sort(
        (a, b) => score(votes.get(b.id)) - score(votes.get(a.id)) || total(b.id) - total(a.id) || byId(a, b),
      );
    case "unpopular":
      return result.sort(
        (a, b) => score(votes.get(a.id)) - score(votes.get(b.id)) || total(b.id) - total(a.id) || byId(a, b),
      );
    case "bst":
      return result.sort((a, b) => bst(b) - bst(a) || byId(a, b));
    case "catch":
      return result.sort((a, b) => a.capture - b.capture || byId(a, b));
    case "easy":
      return result.sort((a, b) => b.capture - a.capture || byId(a, b));
    default:
      return result.sort(byId);
  }
}

/** If the query names exactly one Pokémon (by number or full name), return it. */
export function exactMatch(q: string, list: SpeciesSummary[]): SpeciesSummary | null {
  const trimmed = q.trim();
  const idMatch = /^#?(\d{1,4})$/.exec(trimmed);
  if (idMatch) return list.find((s) => s.id === Number(idMatch[1])) ?? null;
  const n = normalize(trimmed);
  if (!n) return null;
  return list.find((s) => normalize(s.name) === n || s.slug === trimmed.toLowerCase()) ?? null;
}

/** Name-prefix suggestions for the dropdown under the search bar. */
export function suggestions(q: string, list: SpeciesSummary[], limit = 6): SpeciesSummary[] {
  const n = normalize(q);
  if (!n) return [];
  const starts = list.filter((s) => normalize(s.name).startsWith(n));
  const contains = list.filter((s) => !normalize(s.name).startsWith(n) && normalize(s.name).includes(n));
  return [...starts, ...contains].slice(0, limit);
}

// ---------- token editing (keeps the query string the single source of truth) ----------

type TokenKey = "type" | "gen" | "sort";

function tokenMatchesKey(token: string, key: TokenKey): boolean {
  const lower = token.toLowerCase();
  if (lower.startsWith(`${key}:`)) return true;
  if (key === "type") return TYPE_IDS.includes(lower) || lower.startsWith("t:");
  if (key === "gen") return /^gen(eration)?[1-9ivx]+$/.test(lower) || !!REGIONS[lower] || lower.startsWith("g:");
  if (key === "sort") return lower === "popular" || lower === "unpopular" || lower.startsWith("s:");
  return false;
}

/** Value of the first token for `key` (e.g. "fire" for "type:fire" or bare "fire"). */
export function getToken(q: string, key: TokenKey): string | null {
  const p = parseQuery(q);
  if (key === "type") return p.types[0] ?? null;
  if (key === "gen") return p.gens[0] ? String(p.gens[0]) : null;
  return p.sort;
}

/** Replace every token for `key` with `key:value` (or remove them when value is null). */
export function setToken(q: string, key: TokenKey, value: string | null): string {
  const kept = tokenize(q).filter((t) => !tokenMatchesKey(t, key));
  if (value) kept.push(`${key}:${value}`);
  return kept.join(" ");
}
