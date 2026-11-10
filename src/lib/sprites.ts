import type { Card, FormSummary, GameDef, Mon, SpeciesSummary } from "./types";

/** Image & audio URL builders. Nothing is stored locally: every asset is hotlinked. */

const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const BULBAPEDIA = "https://archives.bulbagarden.net/media/upload";
const TCG_IMAGES = "https://images.pokemontcg.io";
const CRIES = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon";

type SpriteRef = Pick<Mon, "pid" | "anim" | "bw">;

/** A species as a drawable Mon (pid = National Dex number). */
export function speciesMon(s: SpeciesSummary): Mon {
  return {
    pid: s.id,
    species: s.id,
    name: s.name,
    types: s.types,
    stats: s.stats,
    height: s.height,
    weight: s.weight,
    anim: s.anim,
    bw: true,
  };
}

export function formMon(f: FormSummary): Mon {
  return {
    pid: f.pid,
    species: f.species,
    name: f.name,
    types: f.types,
    stats: f.stats,
    height: f.height,
    weight: f.weight,
    anim: f.anim,
    bw: f.bw,
    form: f,
  };
}

/** Static pixel sprite (Gen V Black/White style where it exists). */
export function staticSprites(pid: number, hasBw = true): string[] {
  const bw = `${SPRITES}/versions/generation-v/black-white/${pid}.png`;
  const plain = `${SPRITES}/${pid}.png`;
  return hasBw ? [bw, plain] : [plain];
}

/** Animated pixel sprite, or null if none exists. */
export function animatedSprite({ pid, anim }: SpriteRef): string | null {
  if (anim === "bw") return `${SPRITES}/versions/generation-v/black-white/animated/${pid}.gif`;
  if (anim === "sd") return `${SPRITES}/other/showdown/${pid}.gif`;
  return null;
}

/** Back sprites (player side in battle), best first. */
export function backSprites({ pid, anim, bw }: SpriteRef): string[] {
  const list: string[] = [];
  if (anim === "bw") list.push(`${SPRITES}/versions/generation-v/black-white/animated/back/${pid}.gif`);
  if (anim) list.push(`${SPRITES}/other/showdown/back/${pid}.gif`);
  if (bw !== false) list.push(`${SPRITES}/versions/generation-v/black-white/back/${pid}.png`);
  list.push(`${SPRITES}/back/${pid}.png`);
  return list;
}

/** The original 1996 Red/Blue sprite (Gen I species only). */
export function originalSprite(id: number): string | null {
  return id <= 151 ? `${SPRITES}/versions/generation-i/red-blue/transparent/${id}.png` : null;
}

/** Official artwork. Species: Bulbapedia first, PokeAPI mirror as fallback. Forms: PokeAPI. */
export function officialArt(s: Pick<SpeciesSummary, "id" | "art">, pid = s.id): string[] {
  const mirror = `${SPRITES}/other/official-artwork/${pid}.png`;
  if (pid !== s.id) return [mirror];
  const [a, b, file] = s.art.split("/");
  return [`${BULBAPEDIA}/${a}/${b}/${encodeURIComponent(file)}`, mirror];
}

export function cardImage(card: Card, size: "small" | "large"): string {
  if (card.img) return size === "large" ? `${TCG_IMAGES}/${card.img}_hires.png` : `${TCG_IMAGES}/${card.img}.png`;
  return (size === "large" ? card.large : card.small) ?? card.small ?? "";
}

/** Card image with the full fallback chain (INSTRUCTIONS.md §3.1). */
export function cardSources(card: Card | undefined, s: Pick<SpeciesSummary, "id" | "art">, pid = s.id): string[] {
  const art = officialArt(s, pid);
  return card ? [cardImage(card, "large"), cardImage(card, "small"), ...art] : art;
}

export function cryUrl(pid: number): string {
  return `${CRIES}/latest/${pid}.ogg`;
}

// ------------------------------------------------------------------ game modes

const VERSIONS = `${SPRITES}/versions`;
const rangeCache = new WeakMap<object, Set<number>>();

function idSet(ranges: [number, number][] | undefined): Set<number> {
  if (!ranges) return new Set();
  let set = rangeCache.get(ranges);
  if (!set) {
    set = new Set();
    for (const [a, b] of ranges) for (let i = a; i <= b; i++) set.add(i);
    rangeCache.set(ranges, set);
  }
  return set;
}

/** Is this Pokémon (or form) drawn in the given game? */
export function inGame(game: GameDef, pid: number): boolean {
  return idSet(game.ids).has(pid) || idSet(game.iconIds).has(pid);
}

/** Games from Gen VI on use 3D renders, which look wrong with pixelated scaling. */
export const isSmoothGame = (game: GameDef | null) => !!game && game.gen >= 6;

/** Heavy animated renders (Gen VII+): grid tiles use the game's box icons instead. */
const usesIcons = (game: GameDef) => !!game.icon && game.ext !== "png";

export interface SpriteSet {
  /** Shown while idle. */
  still: string[];
  /** Shown on hover / when animating; null = no animation (use a CSS hop). */
  active: string[] | null;
  /** Scale into a fixed box (game sprites vary in size). */
  fit: boolean;
  /** This Pokémon doesn't appear in the selected game, so the modern sprite is shown. */
  missing: boolean;
  smooth: boolean;
}

function modernSet(mon: SpriteRef): SpriteSet {
  const still = staticSprites(mon.pid, mon.bw !== false);
  const anim = animatedSprite(mon);
  return { still, active: anim ? [anim, ...still] : null, fit: false, missing: false, smooth: false };
}

const gameUrl = (_game: GameDef, dir: string, pid: number, ext: string) => `${VERSIONS}/${dir}/${pid}.${ext}`;

/** Small sprite for index tiles, suggestions, evolution trees. */
export function tileSprites(mon: SpriteRef, game: GameDef | null): SpriteSet {
  if (!game) return modernSet(mon);
  const hasFront = idSet(game.ids).has(mon.pid);
  const hasIcon = idSet(game.iconIds).has(mon.pid);
  if (!hasFront && !hasIcon) return { ...modernSet(mon), missing: true };
  const front = hasFront ? gameUrl(game, game.front, mon.pid, game.ext) : null;
  const anim = game.anim && idSet(game.animIds).has(mon.pid) ? gameUrl(game, game.anim, mon.pid, game.animExt ?? "png") : null;
  if (usesIcons(game)) {
    const icon = hasIcon ? gameUrl(game, game.icon!, mon.pid, "png") : null;
    const still = [icon, front].filter((u): u is string => !!u);
    // GIF fronts (Gen VII) are light enough to play on hover; WebP renders (Gen VIII+) are not.
    const active = front && game.ext === "gif" ? [front, ...still] : null;
    return { still, active, fit: true, missing: false, smooth: false };
  }
  const still = [front!];
  return { still, active: anim ? [anim, ...still] : null, fit: true, missing: false, smooth: isSmoothGame(game) };
}

/** Large front sprite for the battle arena / Pokéball reveal. */
export function arenaSprites(mon: SpriteRef, game: GameDef | null): SpriteSet {
  if (!game) return modernSet(mon);
  if (!idSet(game.ids).has(mon.pid)) return { ...modernSet(mon), missing: !idSet(game.iconIds).has(mon.pid) };
  const front = gameUrl(game, game.front, mon.pid, game.ext);
  const anim = game.anim && idSet(game.animIds).has(mon.pid) ? gameUrl(game, game.anim, mon.pid, game.animExt ?? "png") : null;
  return { still: [front], active: anim ? [anim, front] : null, fit: true, missing: false, smooth: isSmoothGame(game) };
}

/** Back sprite for the player's side in battle. */
export function gameBackSprites(mon: SpriteRef, game: GameDef | null): { sources: string[]; fit: boolean; smooth: boolean } {
  if (game?.back && idSet(game.backIds).has(mon.pid)) {
    const list: string[] = [];
    if (game.animBack && idSet(game.animBackIds).has(mon.pid)) list.push(gameUrl(game, game.animBack, mon.pid, game.animExt ?? "gif"));
    list.push(gameUrl(game, game.back, mon.pid, game.backExt ?? game.ext));
    return { sources: list, fit: true, smooth: isSmoothGame(game) };
  }
  return { sources: backSprites(mon), fit: false, smooth: false };
}

/** Cry URLs, best first: original-era cries for Gen I–V games where they exist. */
export function cryUrls(pid: number, game: GameDef | null): string[] {
  const latest = cryUrl(pid);
  if (game?.cry === "legacy" && pid <= 649) return [`${CRIES}/legacy/${pid}.ogg`, latest];
  return [latest];
}
