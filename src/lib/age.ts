/** "Age" = years since the species debuted (INSTRUCTIONS.md §1). */

export const GEN_DEBUT_YEAR: Record<number, number> = {
  1: 1996,
  2: 1999,
  3: 2002,
  4: 2006,
  5: 2010,
  6: 2013,
  7: 2016,
  8: 2019,
  9: 2022,
};

/** Species that debuted later than their generation's first games. [fromId, toId, year] */
const DEBUT_OVERRIDES: [number, number, number][] = [
  [808, 809, 2018], // Meltan, Melmetal (Pokémon GO / Let's Go)
  [891, 898, 2020], // Isle of Armor & Crown Tundra
  [899, 905, 2022], // Legends: Arceus (Hisui)
  [1011, 1024, 2023], // The Teal Mask & The Indigo Disk
  [1025, 1025, 2024], // Pecharunt (Mochi Mayhem)
];

export const GEN_REGION: Record<number, string> = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar",
  9: "Paldea",
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

export function romanGen(gen: number): string {
  return ROMAN[gen] ?? String(gen);
}

export function debutYear(id: number, gen: number): number {
  const override = DEBUT_OVERRIDES.find(([from, to]) => id >= from && id <= to);
  return override ? override[2] : GEN_DEBUT_YEAR[gen] ?? 1996;
}

export function ageYears(id: number, gen: number, now: Date = new Date()): number {
  return Math.max(0, now.getFullYear() - debutYear(id, gen));
}

export function regionFor(id: number, gen: number): string {
  if (id >= 899 && id <= 905) return "Hisui";
  if (id >= 1011 && id <= 1017) return "Kitakami";
  if (id >= 1018 && id <= 1025) return "Unova (Blueberry)";
  if (id === 808 || id === 809) return "Unknown";
  return GEN_REGION[gen] ?? "Unknown";
}
