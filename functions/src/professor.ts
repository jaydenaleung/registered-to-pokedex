/** Prompt + Claude call for the Professor's notes (kept separate so it can be exercised directly). */
import Anthropic from "@anthropic-ai/sdk";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MODEL = "claude-opus-5-5";

export interface SpeciesFacts {
  name: string;
  genus: string;
  types: string[];
  generation: number;
  legendary: boolean;
  mythical: boolean;
  baby: boolean;
  habitat: string | null;
  heightM: number;
  weightKg: number;
  captureRate: number;
  abilities: string[];
  evolvesFrom: string | null;
  evolvesTo: string[];
  pokedex: string[];
}

export const SYSTEM_PROMPT = `You are the Professor in a fan-made, pixel-art Pokédex website. For one Pokémon species you write a short field note that trainers read on its Pokédex page.

Write 110–160 words in two short paragraphs separated by a blank line. Plain text only: no markdown, headings, lists or emoji.
- Paragraph 1: what the species is like in the wild (temperament, habitat, notable behaviour), drawing on the Pokédex entries provided.
- Paragraph 2: practical advice for a trainer: how hard it is to catch (from its capture rate, where 255 is easiest and 3 is hardest), what its typing and abilities mean in battle, and how it evolves if it does.
Stay consistent with the facts you are given and with well-established franchise lore; never invent numbers, moves, locations or game mechanics that are not in the facts. Write warmly, in the voice of a knowledgeable field researcher speaking to a young trainer.`;

export function describe(f: SpeciesFacts, dexId: number): string {
  return JSON.stringify(
    {
      nationalDex: dexId,
      name: f.name,
      category: f.genus,
      types: f.types,
      generation: f.generation,
      status: f.mythical ? "mythical" : f.legendary ? "legendary" : f.baby ? "baby" : "regular",
      habitat: f.habitat,
      height_m: f.heightM,
      weight_kg: f.weightKg,
      captureRate: f.captureRate,
      abilities: f.abilities,
      evolvesFrom: f.evolvesFrom,
      evolvesTo: f.evolvesTo,
      pokedexEntries: f.pokedex,
    },
    null,
    2,
  );
}

export function loadFacts(): Record<string, SpeciesFacts> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(path.join(here, "species-facts.json"), "utf8")) as Record<string, SpeciesFacts>;
}

export async function writeNote(client: Anthropic, dexId: number, facts: SpeciesFacts): Promise<{ text: string; model: string }> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Write the Professor's field note for this species.\n\n<species_facts>\n${describe(facts, dexId)}\n</species_facts>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    logger.warn("Claude declined the request", { dexId, details: response.stop_details });
    throw new HttpsError("failed-precondition", "The Professor declined to write this note.");
  }
  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  if (!text) throw new HttpsError("internal", "The Professor returned an empty note.");
  return { text: text.slice(0, 2000), model: response.model };
}

