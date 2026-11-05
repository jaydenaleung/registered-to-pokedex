import type { Card, SpeciesSummary } from "./types";

/** Image & audio URL builders. Nothing is stored locally: every asset is hotlinked. */

const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const BULBAPEDIA = "https://archives.bulbagarden.net/media/upload";
const TCG_IMAGES = "https://images.pokemontcg.io";
const CRIES = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon";

type SpriteRef = Pick<SpeciesSummary, "id" | "anim">;

/** Static pixel sprite (Gen V Black/White style, every species has one). */
export function staticSprites(id: number): string[] {
  return [`${SPRITES}/versions/generation-v/black-white/${id}.png`, `${SPRITES}/${id}.png`];
}

/** Animated pixel sprite, or null if none exists for this species. */
export function animatedSprite({ id, anim }: SpriteRef): string | null {
  if (anim === "bw") return `${SPRITES}/versions/generation-v/black-white/animated/${id}.gif`;
  if (anim === "sd") return `${SPRITES}/other/showdown/${id}.gif`;
  return null;
}

/** The original 1996 Red/Blue sprite (Gen I species only). */
export function originalSprite(id: number): string | null {
  return id <= 151 ? `${SPRITES}/versions/generation-i/red-blue/transparent/${id}.png` : null;
}

/** Official Sugimori-style artwork: Bulbapedia first, PokeAPI mirror as fallback. */
export function officialArt(s: Pick<SpeciesSummary, "id" | "art">): string[] {
  const [a, b, file] = s.art.split("/");
  return [`${BULBAPEDIA}/${a}/${b}/${encodeURIComponent(file)}`, `${SPRITES}/other/official-artwork/${s.id}.png`];
}

export function cardImage(card: Card, size: "small" | "large"): string {
  if (card.img) return size === "large" ? `${TCG_IMAGES}/${card.img}_hires.png` : `${TCG_IMAGES}/${card.img}.png`;
  return (size === "large" ? card.large : card.small) ?? card.small ?? "";
}

/** Card image with the full fallback chain (INSTRUCTIONS.md §3.1). */
export function cardSources(card: Card | undefined, s: Pick<SpeciesSummary, "id" | "art">): string[] {
  const art = officialArt(s);
  return card ? [cardImage(card, "large"), cardImage(card, "small"), ...art] : art;
}

export function cryUrl(id: number): string {
  return `${CRIES}/latest/${id}.ogg`;
}
