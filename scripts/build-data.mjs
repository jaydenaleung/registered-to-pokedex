#!/usr/bin/env node
/**
 * Data pipeline for Registered To Pokédex (INSTRUCTIONS.md §4).
 *
 * Downloads open data (PokeAPI CSV dump, PokemonTCG card dataset, PokeAPI sprite tree)
 * into .cache/, then writes compact JSON into public/data/ and the Professor's fact sheet
 * into functions/src/. No image files are ever downloaded or written: only URLs/paths.
 *
 * Usage:  node scripts/build-data.mjs [--refresh]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache");
const OUT = path.join(ROOT, "public", "data");
const FUNCTIONS_OUT = path.join(ROOT, "functions", "src", "species-facts.json");
const REFRESH = process.argv.includes("--refresh");

const MAX_ID = 1025;
const EN = "9";
const POKEAPI_CSV = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const TCG_DATA = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master";
const SPRITES_REPO = "https://github.com/PokeAPI/sprites.git";
const MAX_CARDS = 24;

const CSV_FILES = [
  "pokemon_species", "pokemon_species_names", "pokemon_species_flavor_text", "pokemon",
  "pokemon_types", "types", "type_names", "type_efficacy", "pokemon_stats",
  "pokemon_abilities", "ability_names", "ability_flavor_text", "moves", "move_names",
  "pokemon_moves", "pokemon_evolution", "evolution_trigger_prose", "item_names",
  "version_groups", "versions", "version_names", "pokemon_egg_groups", "egg_group_prose",
  "pokemon_habitat_names", "pokemon_color_names", "pokemon_shape_prose", "growth_rate_prose",
  "location_names", "pokemon_forms", "pokemon_form_names", "move_meta", "move_meta_stat_changes",
];

// ---------------------------------------------------------------- utilities

function log(...args) {
  console.log("[data]", ...args);
}

async function download(url, dest, { optional = false } = {}) {
  if (!REFRESH && fs.existsSync(dest) && fs.statSync(dest).size > 0) return true;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404 && optional) return false;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return true;
    } catch (err) {
      if (attempt === 4) throw new Error(`Failed to download ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  return false;
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

/** RFC 4180 CSV parser (quoted fields may contain commas, quotes and newlines). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function readCSV(name) {
  return parseCSV(fs.readFileSync(path.join(CACHE, "pokeapi", `${name}.csv`), "utf8"));
}

/** Map of id -> English name for a *_names / *_prose table. */
function englishNames(rows, idKey, nameKey = "name", langKey = "local_language_id") {
  const map = new Map();
  for (const r of rows) if (r[langKey] === EN) map.set(r[idKey], r[nameKey]);
  return map;
}

function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

const num = (v) => (v === "" || v == null ? null : Number(v));
const pad4 = (n) => String(n).padStart(4, "0");

function cleanText(s) {
  return s
    .replace(/­\s*/g, "")
    .replace(/[\f\n\r\t\v]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ ([,.!?])/g, "$1")
    .trim();
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Bulbapedia (Bulbagarden Archives) is MediaWiki: an upload lives at
 * /media/upload/{md5[0]}/{md5[0..1]}/{File_name} where md5 is taken over the
 * file name with spaces as underscores.
 */
function bulbapediaArtPath(id, name) {
  const file = `${pad4(id)}${name.replace(/:/g, "").replace(/ /g, "_")}.png`.normalize("NFC");
  const h = crypto.createHash("md5").update(file, "utf8").digest("hex");
  return `${h[0]}/${h.slice(0, 2)}/${file}`;
}

// ---------------------------------------------------------------- downloads

async function downloadAll() {
  log("downloading PokeAPI CSVs (cached in .cache/pokeapi)…");
  await pool(CSV_FILES, 6, (f) => download(`${POKEAPI_CSV}/${f}.csv`, path.join(CACHE, "pokeapi", `${f}.csv`)));

  log("downloading PokemonTCG card data (cached in .cache/tcg)…");
  await download(`${TCG_DATA}/sets/en.json`, path.join(CACHE, "tcg", "sets.json"));
  const sets = JSON.parse(fs.readFileSync(path.join(CACHE, "tcg", "sets.json"), "utf8"));
  await pool(sets, 8, (s) =>
    download(`${TCG_DATA}/cards/en/${s.id}.json`, path.join(CACHE, "tcg", "cards", `${s.id}.json`), {
      optional: true,
    }),
  );
  return sets;
}

/**
 * Lists which sprite files exist in the PokeAPI/sprites repo, using a tree-only clone
 * (no image data is downloaded). Returns a lister: (dir, ext) -> Set of ids (incl. form ids).
 */
function spriteTree() {
  const dir = path.join(CACHE, "sprites-tree");
  try {
    if (!fs.existsSync(path.join(dir, ".git")) || REFRESH) {
      fs.rmSync(dir, { recursive: true, force: true });
      log("cloning PokeAPI/sprites tree (no blobs)…");
      execFileSync("git", ["clone", "-q", "--filter=blob:none", "--no-checkout", "--depth", "1", SPRITES_REPO, dir]);
    }
    const cache = new Map();
    const list = (sub, ext) => {
      const key = `${sub}|${ext}`;
      if (!cache.has(key)) {
        const re = new RegExp(`^(\\d+)\\.${ext}$`);
        cache.set(
          key,
          new Set(
            execFileSync("git", ["-C", dir, "ls-tree", "--name-only", "HEAD", `sprites/pokemon/${sub}/`], {
              encoding: "utf8",
              maxBuffer: 64 * 1024 * 1024,
            })
              .split("\n")
              .map((p) => re.exec(p.split("/").pop() ?? ""))
              .filter(Boolean)
              .map((m) => Number(m[1])),
          ),
        );
      }
      return cache.get(key);
    };
    return { list, exact: true };
  } catch (err) {
    log(`sprite tree unavailable (${err.message.split("\n")[0]}); assuming full coverage`);
    const all = new Set(Array.from({ length: MAX_ID }, (_, i) => i + 1));
    return { list: () => all, exact: false };
  }
}

/** Per-game sprite sets (INSTRUCTIONS.md §11). Paths are relative to sprites/pokemon/versions. */
const GAMES = [
  { id: "rb", name: "Red / Blue", gen: 1, year: 1996, versions: ["Red", "Blue"], front: "generation-i/red-blue/transparent", back: "generation-i/red-blue/transparent/back" },
  { id: "yellow", name: "Yellow", gen: 1, year: 1998, versions: ["Yellow"], front: "generation-i/yellow/transparent", back: "generation-i/yellow/transparent/back" },
  { id: "gold", name: "Gold", gen: 2, year: 1999, versions: ["Gold"], front: "generation-ii/gold/transparent", back: "generation-ii/gold/transparent/back" },
  { id: "silver", name: "Silver", gen: 2, year: 1999, versions: ["Silver"], front: "generation-ii/silver/transparent", back: "generation-ii/silver/transparent/back" },
  { id: "crystal", name: "Crystal", gen: 2, year: 2000, versions: ["Crystal"], front: "generation-ii/crystal/transparent", back: "generation-ii/crystal/transparent/back", anim: "generation-ii/crystal/animated", animExt: "gif" },
  { id: "rs", name: "Ruby / Sapphire", gen: 3, year: 2002, versions: ["Ruby", "Sapphire"], front: "generation-iii/ruby-sapphire", back: "generation-iii/ruby-sapphire/back" },
  { id: "emerald", name: "Emerald", gen: 3, year: 2004, versions: ["Emerald"], front: "generation-iii/emerald", back: "generation-iii/emerald/back", anim: "generation-iii/emerald/animated", animExt: "png" },
  { id: "frlg", name: "FireRed / LeafGreen", gen: 3, year: 2004, versions: ["FireRed", "LeafGreen"], front: "generation-iii/firered-leafgreen", back: "generation-iii/firered-leafgreen/back" },
  { id: "dp", name: "Diamond / Pearl", gen: 4, year: 2006, versions: ["Diamond", "Pearl"], front: "generation-iv/diamond-pearl", back: "generation-iv/diamond-pearl/back", anim: "generation-iv/diamond-pearl/animated", animExt: "png" },
  { id: "pt", name: "Platinum", gen: 4, year: 2008, versions: ["Platinum"], front: "generation-iv/platinum", back: "generation-iv/platinum/back", anim: "generation-iv/platinum/animated", animExt: "png" },
  { id: "hgss", name: "HeartGold / SoulSilver", gen: 4, year: 2009, versions: ["HeartGold", "SoulSilver"], front: "generation-iv/heartgold-soulsilver", back: "generation-iv/heartgold-soulsilver/back", anim: "generation-iv/heartgold-soulsilver/animated", animExt: "png" },
  { id: "bw", name: "Black / White", gen: 5, year: 2010, versions: ["Black", "White", "Black 2", "White 2"], front: "generation-v/black-white", back: "generation-v/black-white/back", anim: "generation-v/black-white/animated", animExt: "gif", animBack: "generation-v/black-white/animated/back" },
  { id: "xy", name: "X / Y", gen: 6, year: 2013, versions: ["X", "Y"], front: "generation-vi/x-y", back: "generation-vi/x-y/back" },
  { id: "oras", name: "Omega Ruby / Alpha Sapphire", gen: 6, year: 2014, versions: ["Omega Ruby", "Alpha Sapphire"], front: "generation-vi/omega-ruby-alpha-sapphire", back: "generation-vi/omega-ruby-alpha-sapphire/back" },
  { id: "usum", name: "Ultra Sun / Ultra Moon", gen: 7, year: 2017, versions: ["Ultra Sun", "Ultra Moon", "Sun", "Moon"], front: "generation-vii/ultra-sun-ultra-moon", ext: "gif", back: "generation-vii/ultra-sun-ultra-moon/back", backExt: "gif", icon: "generation-vii/icons" },
  { id: "lgpe", name: "Let's Go Pikachu / Eevee", gen: 7, year: 2018, versions: ["Let’s Go, Pikachu!", "Let’s Go, Eevee!"], front: "generation-vii/lets-go-pikachu-lets-go-eevee", ext: "gif", back: "generation-vii/lets-go-pikachu-lets-go-eevee/back", backExt: "gif", icon: "generation-vii/lets-go-pikachu-lets-go-eevee/icons" },
  { id: "swsh", name: "Sword / Shield", gen: 8, year: 2019, versions: ["Sword", "Shield"], front: "generation-viii/sword-shield", ext: "webp", back: "generation-viii/sword-shield/back", backExt: "webp", icon: "generation-viii/sword-shield/icons" },
  { id: "bdsp", name: "Brilliant Diamond / Shining Pearl", gen: 8, year: 2021, versions: ["Brilliant Diamond", "Shining Pearl"], front: "generation-viii/brilliant-diamond-shining-pearl", ext: "webp", back: "generation-viii/brilliant-diamond-shining-pearl/back", backExt: "webp", icon: "generation-viii/brilliant-diamond-shining-pearl/icons" },
  { id: "pla", name: "Legends: Arceus", gen: 8, year: 2022, versions: ["Legends: Arceus"], front: "generation-viii/legends-arceus", ext: "webp", back: "generation-viii/legends-arceus/back", backExt: "webp", icon: "generation-viii/legends-arceus/icons" },
  { id: "sv", name: "Scarlet / Violet", gen: 9, year: 2022, versions: ["Scarlet", "Violet"], front: "generation-ix/scarlet-violet", ext: "webp", back: "generation-ix/scarlet-violet/back", backExt: "webp", icon: "generation-ix/scarlet-violet/icons" },
  { id: "za", name: "Legends: Z-A", gen: 9, year: 2025, versions: ["Legends: Z-A"], front: "generation-ix/legends-za", ext: "webp", back: "generation-ix/legends-za/back", backExt: "webp", icon: "generation-ix/legends-za/icons" },
  { id: "champions", name: "Pokémon Champions", gen: 9, year: 2026, versions: ["Champions"], front: "generation-ix/champions", ext: "webp", back: "generation-ix/champions/back", backExt: "webp", icon: "generation-ix/champions/icons" },
];

/** Varieties left out of the form switcher: event costumes, totems and duplicates. */
const FORM_EXCLUDE = /-totem|-cap$|-cosplay|-rock-star|-belle|-pop-star|-phd|-libre|-starter$|-power-construct$|-battle-bond$/;

/** Moves whose damage isn't "power"-based, for the battle simulator. */
const MOVE_FX = {
  "seismic-toss": "level",
  "night-shade": "level",
  "sonic-boom": "fixed20",
  "dragon-rage": "fixed40",
  "super-fang": "half",
  "natures-madness": "half",
  ruination: "half",
  "low-kick": "weight",
  "grass-knot": "weight",
  "heavy-slam": "heavier",
  "heat-crash": "heavier",
  return: "p102",
  frustration: "p102",
  flail: "lowhp",
  reversal: "lowhp",
  "gyro-ball": "gyro",
  "electro-ball": "electro",
  guillotine: "ohko",
  "horn-drill": "ohko",
  fissure: "ohko",
  "sheer-cold": "ohko",
};

/** Moves that take two turns in battle: charge first, or recharge after. */
const MOVE_TURN = {
  "hyper-beam": "recharge", "giga-impact": "recharge", "blast-burn": "recharge", "hydro-cannon": "recharge",
  "frenzy-plant": "recharge", "rock-wrecker": "recharge", "roar-of-time": "recharge", "prismatic-laser": "recharge",
  eternabeam: "recharge", "meteor-assault": "recharge",
  fly: "charge", dig: "charge", dive: "charge", bounce: "charge", "solar-beam": "charge", "solar-blade": "charge",
  "sky-attack": "charge", "skull-bash": "charge", "razor-wind": "charge", "freeze-shock": "charge", "ice-burn": "charge",
  "meteor-beam": "charge", "phantom-force": "charge", "shadow-force": "charge", "electro-shot": "charge", geomancy: "charge",
  "focus-punch": "focus",
};

/** [[a,b],…] ranges for a sorted id list (compact JSON). */
function toRanges(ids) {
  const sorted = [...ids].sort((a, b) => a - b);
  const out = [];
  for (const id of sorted) {
    const last = out[out.length - 1];
    if (last && id === last[1] + 1) last[1] = id;
    else out.push([id, id]);
  }
  return out;
}

// ---------------------------------------------------------------- main build

const REGION_NAMES = {
  1: "Kanto", 2: "Johto", 3: "Hoenn", 4: "Sinnoh", 5: "Unova", 6: "Kalos", 7: "Alola", 8: "Galar",
  9: "Hisui", 10: "Paldea", 11: "Kitakami", 12: "Blueberry Academy", 13: "Lumiose City",
};

// Move-list preference: newest main-series game first. Version groups in the same
// array are merged (base game + its DLC).
const MOVE_GROUP_PREFERENCE = [
  [25, 26, 27], [20, 21, 22], [18], [17], [16], [15], [14], [11], [10], [9], [8], [7], [6], [5],
  [4], [3], [2], [1], [23], [24], [30, 31], [32], [19],
];

async function main() {
  const sets = await downloadAll();
  const tree = spriteTree();
  const sprites = {
    bw: tree.list("versions/generation-v/black-white/animated", "gif"),
    bwStatic: tree.list("versions/generation-v/black-white", "png"),
    showdown: tree.list("other/showdown", "gif"),
    exact: tree.exact,
  };

  log("parsing CSVs…");
  const species = readCSV("pokemon_species").filter((r) => Number(r.id) <= MAX_ID);
  const speciesNames = new Map();
  const genus = new Map();
  for (const r of readCSV("pokemon_species_names")) {
    if (r.local_language_id !== EN) continue;
    speciesNames.set(r.pokemon_species_id, r.name);
    genus.set(r.pokemon_species_id, r.genus);
  }
  const pokemonRows = readCSV("pokemon");
  const defaultPokemon = new Map(); // species id -> pokemon row
  for (const p of pokemonRows) if (p.is_default === "1") defaultPokemon.set(p.species_id, p);

  const typeIdentifiers = new Map(readCSV("types").map((t) => [t.id, t.identifier]));
  const typeNames = englishNames(readCSV("type_names"), "type_id");
  const pokemonTypes = groupBy(readCSV("pokemon_types"), "pokemon_id");
  const pokemonStats = groupBy(readCSV("pokemon_stats"), "pokemon_id");
  const pokemonAbilities = groupBy(readCSV("pokemon_abilities"), "pokemon_id");
  const abilityNames = englishNames(readCSV("ability_names"), "ability_id");

  const versionGroups = new Map(readCSV("version_groups").map((v) => [v.id, v]));
  const versions = new Map(readCSV("versions").map((v) => [v.id, v]));
  const versionNames = englishNames(readCSV("version_names"), "version_id");
  const versionOrder = (versionId) => {
    const v = versions.get(versionId);
    return v ? Number(versionGroups.get(v.version_group_id)?.order ?? 0) * 100 + Number(versionId) : 0;
  };
  const groupLabel = (groupIds) =>
    [...versions.values()]
      .filter((v) => groupIds.includes(Number(v.version_group_id)))
      .map((v) => versionNames.get(v.id) ?? capitalize(v.identifier))
      .filter((name, i, arr) => arr.indexOf(name) === i)
      .slice(0, 2)
      .join(" / ");

  // Ability descriptions: newest English flavour text.
  const abilityText = new Map();
  for (const r of readCSV("ability_flavor_text")) {
    if (r.language_id !== EN) continue;
    const order = Number(versionGroups.get(r.version_group_id)?.order ?? 0);
    const prev = abilityText.get(r.ability_id);
    if (!prev || order > prev.order) abilityText.set(r.ability_id, { order, text: cleanText(r.flavor_text) });
  }

  const eggGroupNames = englishNames(readCSV("egg_group_prose"), "egg_group_id");
  const speciesEggGroups = groupBy(readCSV("pokemon_egg_groups"), "species_id");
  const habitatNames = englishNames(readCSV("pokemon_habitat_names"), "pokemon_habitat_id");
  const colorNames = englishNames(readCSV("pokemon_color_names"), "pokemon_color_id");
  const shapeNames = englishNames(readCSV("pokemon_shape_prose"), "pokemon_shape_id");
  const growthNames = englishNames(readCSV("growth_rate_prose"), "growth_rate_id");
  const itemNames = englishNames(readCSV("item_names"), "item_id");
  const moveNames = englishNames(readCSV("move_names"), "move_id");
  const locationNames = englishNames(readCSV("location_names"), "location_id");
  const triggerNames = englishNames(readCSV("evolution_trigger_prose"), "evolution_trigger_id");

  // Flavour text (Pokédex entries)
  log("collecting Pokédex entries…");
  const flavorBySpecies = new Map();
  for (const r of readCSV("pokemon_species_flavor_text")) {
    if (r.language_id !== EN || Number(r.species_id) > MAX_ID) continue;
    if (!flavorBySpecies.has(r.species_id)) flavorBySpecies.set(r.species_id, []);
    flavorBySpecies.get(r.species_id).push(r);
  }

  // Moves
  log("collecting learnsets (pokemon_moves.csv is large)…");
  const movesData = new Map(readCSV("moves").map((m) => [m.id, m]));
  const learnsets = new Map(); // pokemon id -> version group -> {level:[], machine:Set, egg:Set, tutor:Set}
  const METHOD = { 1: "level", 2: "egg", 3: "tutor", 4: "machine" };
  for (const r of readCSV("pokemon_moves")) {
    const pid = Number(r.pokemon_id);
    const method = METHOD[r.pokemon_move_method_id];
    if (!method) continue;
    if (!learnsets.has(pid)) learnsets.set(pid, new Map());
    const byGroup = learnsets.get(pid);
    const vg = Number(r.version_group_id);
    if (!byGroup.has(vg)) byGroup.set(vg, { level: [], machine: new Set(), egg: new Set(), tutor: new Set() });
    const entry = byGroup.get(vg);
    if (method === "level") entry.level.push([Number(r.level || 0), Number(r.move_id)]);
    else entry[method].add(Number(r.move_id));
  }
  const usedMoves = new Set();

  function pickLearnset(pid) {
    const byGroup = learnsets.get(pid);
    if (!byGroup) return null;
    for (const groupIds of MOVE_GROUP_PREFERENCE) {
      const entries = groupIds.map((g) => byGroup.get(g)).filter(Boolean);
      if (!entries.some((e) => e.level.length)) continue;
      const level = new Map();
      const machine = new Set();
      const egg = new Set();
      const tutor = new Set();
      for (const e of entries) {
        for (const [lvl, mv] of e.level) {
          const key = `${lvl}:${mv}`;
          if (!level.has(key)) level.set(key, [lvl, mv]);
        }
        e.machine.forEach((m) => machine.add(m));
        e.egg.forEach((m) => egg.add(m));
        e.tutor.forEach((m) => tutor.add(m));
      }
      const levelList = [...level.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      // A move learned at several levels is listed once, at its lowest level.
      const seen = new Set();
      const dedupLevel = levelList.filter(([, mv]) => (seen.has(mv) ? false : seen.add(mv)));
      const byName = (a, b) => (moveNames.get(String(a)) ?? "").localeCompare(moveNames.get(String(b)) ?? "");
      const result = {
        game: groupLabel(groupIds),
        level: dedupLevel,
        machine: [...machine].sort(byName),
        egg: [...egg].sort(byName),
        tutor: [...tutor].filter((m) => !machine.has(m)).sort(byName),
      };
      [...result.level.map((l) => l[1]), ...result.machine, ...result.egg, ...result.tutor].forEach((m) =>
        usedMoves.add(m),
      );
      return result;
    }
    return null;
  }

  // Evolution conditions
  const evoRows = groupBy(readCSV("pokemon_evolution"), "evolved_species_id");
  const speciesById = new Map(species.map((s) => [s.id, s]));
  const name = (id) => speciesNames.get(String(id)) ?? `#${id}`;
  const typeName = (id) => typeNames.get(String(id)) ?? typeIdentifiers.get(String(id)) ?? "?";

  function conditionParts(r) {
    const t = r.evolution_trigger_id;
    const item = itemNames.get(r.trigger_item_id);
    const held = itemNames.get(r.held_item_id);
    const move = moveNames.get(r.known_move_id);
    const usedMove = moveNames.get(r.used_move_id);
    const parts = [];
    switch (t) {
      case "1":
        parts.push(r.minimum_level ? `Lv. ${r.minimum_level}` : "Level up");
        break;
      case "2":
        parts.push("Trade");
        break;
      case "3":
        parts.push(item ? `Use ${item}` : "Use an item");
        break;
      case "4":
        parts.push("Lv. 20 with a spare party slot and Poké Ball");
        break;
      case "5":
        parts.push("Spin around holding a Sweet");
        break;
      case "6":
        parts.push("Train in the Tower of Darkness");
        break;
      case "7":
        parts.push("Train in the Tower of Waters");
        break;
      case "8":
        parts.push("Land 3 critical hits in one battle");
        break;
      case "9":
        parts.push(`Take ${r.minimum_damage_taken || 49}+ damage, then pass under a stone arch`);
        break;
      case "11":
        parts.push(`Use ${usedMove ?? move ?? "a move"} in Agile Style ×${r.minimum_move_count || 20}`);
        break;
      case "12":
        parts.push(`Use ${usedMove ?? move ?? "a move"} in Strong Style ×${r.minimum_move_count || 20}`);
        break;
      case "13":
        parts.push(`Take ${r.minimum_damage_taken || 294}+ recoil damage`);
        break;
      case "14":
        parts.push(`Use ${usedMove ?? "a move"} ×${r.minimum_move_count || 20}`);
        break;
      case "15":
        parts.push("Defeat 3 Bisharp that lead Pawniard");
        break;
      case "16":
        parts.push("Collect 999 Gimmighoul Coins");
        break;
      case "17":
        parts.push("400 Meltan Candy (Pokémon GO)");
        break;
      default:
        parts.push(triggerNames.get(t) ?? "Special");
    }
    if (t === "2" && held) parts.push(`holding ${held}`);
    else if (held) parts.push(`holding ${held}`);
    if (r.trade_species_id) parts.push(`for ${name(r.trade_species_id)}`);
    if (r.minimum_happiness) parts.push("High Friendship");
    if (r.minimum_beauty) parts.push("High Beauty");
    if (r.minimum_affection) parts.push("High Affection");
    if (move && t !== "11" && t !== "12") parts.push(`knowing ${move}`);
    if (r.known_move_type_id) parts.push(`knowing a ${typeName(r.known_move_type_id)} move`);
    if (r.relative_physical_stats !== "") {
      parts.push({ 1: "Atk > Def", "-1": "Atk < Def", 0: "Atk = Def" }[r.relative_physical_stats]);
    }
    if (r.party_species_id) parts.push(`with ${name(r.party_species_id)} in party`);
    if (r.party_type_id) parts.push(`with a ${typeName(r.party_type_id)}-type in party`);
    if (r.gender_id === "1") parts.push("(female)");
    if (r.gender_id === "2") parts.push("(male)");
    if (r.time_of_day) parts.push(`(${capitalize(r.time_of_day)})`);
    if (r.needs_overworld_rain === "1") parts.push("while raining");
    if (r.turn_upside_down === "1") parts.push("with the console upside down");
    if (r.needs_multiplayer === "1") parts.push("in Union Circle");
    if (r.near_special_rock === "1") parts.push("near a special rock");
    if (r.minimum_steps) parts.push(`after ${r.minimum_steps} steps with you`);
    if (r.region_id && REGION_NAMES[r.region_id]) parts.push(`in ${REGION_NAMES[r.region_id]}`);
    return parts.filter(Boolean);
  }

  function evolutionCondition(speciesId) {
    const rows = evoRows.get(String(speciesId)) ?? [];
    const byBase = new Map(); // condition text without location -> Set(locations)
    for (const r of rows) {
      const base = conditionParts(r).reduce(
        (acc, part, i) => (i === 0 ? part : part.startsWith("(") ? `${acc} ${part}` : `${acc}, ${part}`),
        "",
      );
      if (!byBase.has(base)) byBase.set(base, new Set());
      if (r.location_id && locationNames.get(r.location_id)) byBase.get(base).add(locationNames.get(r.location_id));
    }
    const texts = [...byBase.entries()].map(([base, locs]) => {
      if (!locs.size) return base;
      const list = [...locs];
      return `${base} at ${list[0]}${list.length > 1 ? ` (or ${list.length - 1} other place${list.length > 2 ? "s" : ""})` : ""}`;
    });
    // If a location-free variant exists alongside location variants, keep both (different games).
    return [...new Set(texts)].slice(0, 3).join(" or ") || null;
  }

  const chainMembers = groupBy(species, "evolution_chain_id");
  function evolutionTree(chainId) {
    const members = chainMembers.get(chainId) ?? [];
    const childrenOf = (parentId) =>
      members
        .filter((m) => m.evolves_from_species_id === parentId)
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((m) => ({
          id: Number(m.id),
          name: name(m.id),
          condition: evolutionCondition(m.id),
          children: childrenOf(m.id),
        }));
    const root = members.find((m) => !m.evolves_from_species_id || !speciesById.has(m.evolves_from_species_id));
    if (!root) return null;
    return { id: Number(root.id), name: name(root.id), condition: null, children: childrenOf(root.id) };
  }

  // TCG cards
  log("indexing TCG cards…");
  const setById = new Map(sets.map((s) => [s.id, s]));
  const cardsByDex = new Map();
  let cardTotal = 0;
  for (const s of sets) {
    const file = path.join(CACHE, "tcg", "cards", `${s.id}.json`);
    if (!fs.existsSync(file)) continue;
    for (const c of JSON.parse(fs.readFileSync(file, "utf8"))) {
      if (!c.nationalPokedexNumbers?.length || !c.images?.small) continue;
      cardTotal++;
      const m = /^https:\/\/images\.pokemontcg\.io\/(.+)\.png$/.exec(c.images.small);
      const large = c.images.large;
      const compact = m && large === `https://images.pokemontcg.io/${m[1]}_hires.png`;
      const card = {
        id: c.id,
        name: c.name,
        set: setById.get(s.id)?.name ?? s.id,
        date: (s.releaseDate ?? "").replace(/\//g, "-"),
        rarity: c.rarity ?? null,
        number: c.number,
        artist: c.artist ?? null,
        ...(compact ? { img: m[1] } : { small: c.images.small, large: c.images.large }),
      };
      for (const dex of c.nationalPokedexNumbers) {
        if (dex < 1 || dex > MAX_ID) continue;
        if (!cardsByDex.has(dex)) cardsByDex.set(dex, []);
        cardsByDex.get(dex).push(card);
      }
    }
  }
  const FEATURED_RARITIES = new Set(["Special Illustration Rare", "Illustration Rare"]);
  function pickCards(dex) {
    const all = (cardsByDex.get(dex) ?? []).slice().sort((a, b) =>
      b.date.localeCompare(a.date) || String(a.number).localeCompare(String(b.number), "en", { numeric: true }),
    );
    if (!all.length) return [];
    const featured = all.find((c) => FEATURED_RARITIES.has(c.rarity)) ?? all[0];
    // Prefer the species' own card over shared multi-Pokémon cards for the rest of the list.
    const rest = all.filter((c) => c !== featured);
    return [featured, ...rest].slice(0, MAX_CARDS);
  }

  // ------------------------------------------------------------ assemble
  log("assembling species…");
  // ------------------------------------------------------------ forms
  const formNames = new Map();
  for (const r of readCSV("pokemon_form_names")) if (r.local_language_id === EN) formNames.set(r.pokemon_form_id, r);
  const defaultFormOf = new Map(); // pokemon id -> its default pokemon_forms row
  for (const f of readCSV("pokemon_forms")) if (f.is_default === "1") defaultFormOf.set(f.pokemon_id, f);
  const varietiesBySpecies = groupBy(
    pokemonRows.filter((p) => p.is_default === "0" && Number(p.species_id) <= MAX_ID && !FORM_EXCLUDE.test(p.identifier)),
    "species_id",
  );
  const REGION_ADJ = { alola: "Alolan", galar: "Galarian", hisui: "Hisuian", paldea: "Paldean" };
  const formKind = (ident) => {
    const region = /-(alola|galar|hisui|paldea)/.exec(ident);
    if (region) return { kind: "regional", tag: region[1] };
    if (/-mega/.test(ident)) return { kind: "mega", tag: "mega" };
    if (/-primal$/.test(ident)) return { kind: "primal", tag: "primal" };
    if (/-gmax$/.test(ident)) return { kind: "gmax", tag: "gmax" };
    return { kind: "other", tag: "other" };
  };
  const pokemonTypesOf = (pid) =>
    (pokemonTypes.get(String(pid)) ?? []).sort((a, b) => Number(a.slot) - Number(b.slot)).map((t) => typeIdentifiers.get(t.type_id));
  const pokemonStatsOf = (pid) =>
    [1, 2, 3, 4, 5, 6].map((statId) => Number((pokemonStats.get(String(pid)) ?? []).find((r) => r.stat_id === String(statId))?.base_stat ?? 0));
  const abilitiesOf = (pid) =>
    (pokemonAbilities.get(String(pid)) ?? [])
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .map((a) => ({
        name: abilityNames.get(a.ability_id) ?? a.ability_id,
        hidden: a.is_hidden === "1",
        description: abilityText.get(a.ability_id)?.text ?? "",
      }));
  const animOf = (pid) => (sprites.bw.has(pid) ? "bw" : sprites.showdown.has(pid) ? "sd" : null);
  const formIndex = [];

  fs.mkdirSync(path.join(OUT, "pokemon"), { recursive: true });
  const index = [];
  const facts = {};
  const coverage = { cards: 0, bwAnim: 0, showdownAnim: 0, noAnim: 0, moves: 0 };

  for (const s of species.sort((a, b) => Number(a.id) - Number(b.id))) {
    const id = Number(s.id);
    const p = defaultPokemon.get(s.id);
    if (!p) throw new Error(`No default pokemon row for species ${id}`);
    const speciesName = speciesNames.get(s.id);
    const types = (pokemonTypes.get(p.id) ?? [])
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .map((t) => typeIdentifiers.get(t.type_id));
    const stats = [1, 2, 3, 4, 5, 6].map(
      (statId) => Number((pokemonStats.get(p.id) ?? []).find((r) => r.stat_id === String(statId))?.base_stat ?? 0),
    );
    const anim = sprites.bw.has(id) ? "bw" : sprites.showdown.has(id) ? "sd" : null;
    coverage[anim === "bw" ? "bwAnim" : anim === "sd" ? "showdownAnim" : "noAnim"]++;

    const record = {
      id,
      name: speciesName,
      slug: s.identifier,
      types,
      gen: Number(s.generation_id),
      genus: genus.get(s.id) ?? "",
      capture: Number(s.capture_rate),
      stats,
      height: Number(p.height),
      weight: Number(p.weight),
      ...(s.is_legendary === "1" ? { legendary: true } : {}),
      ...(s.is_mythical === "1" ? { mythical: true } : {}),
      ...(s.is_baby === "1" ? { baby: true } : {}),
      anim,
      art: bulbapediaArtPath(id, speciesName),
    };
    index.push(record);

    // Alternate forms (regional variants, Mega Evolutions, Gigantamax, other battle forms).
    const defaultForm = defaultFormOf.get(p.id);
    const defaultLabel = (defaultForm && formNames.get(defaultForm.id)?.form_name) || null;
    const formDetails = [];
    const formTags = new Set();
    for (const v of (varietiesBySpecies.get(s.id) ?? []).sort((a, b) => Number(a.order) - Number(b.order) || Number(a.id) - Number(b.id))) {
      const pid = Number(v.id);
      const f = defaultFormOf.get(v.id);
      const names = f ? formNames.get(f.id) : null;
      const { kind, tag } = formKind(v.identifier);
      formTags.add(tag);
      const formName =
        names?.pokemon_name ||
        (kind === "regional" ? `${REGION_ADJ[tag]} ${speciesName}` : `${speciesName} (${capitalize(v.identifier.split("-").slice(1).join(" "))})`);
      let label = names?.form_name || capitalize(v.identifier.split("-").slice(1).join(" "));
      if (kind === "regional") label = label.replace(/ Form\b/, "");
      if (kind === "mega" || kind === "primal") label = formName.replace(` ${speciesName}`, "").replace(speciesName, "").trim() || label;
      if (kind === "gmax") label = "Gigantamax";
      const formMoves = pickLearnset(pid);
      const adjective = kind === "regional" ? REGION_ADJ[tag] : null;
      const formCards =
        kind === "regional"
          ? (cardsByDex.get(id) ?? []).filter((c) => c.name.startsWith(`${adjective} `))
          : kind === "mega"
            ? (cardsByDex.get(id) ?? []).filter((c) => /^(Mega |M )/.test(c.name))
            : [];
      formIndex.push({
        pid,
        species: id,
        name: formName,
        label,
        kind,
        types: pokemonTypesOf(pid),
        stats: pokemonStatsOf(pid),
        height: Number(v.height),
        weight: Number(v.weight),
        anim: animOf(pid),
        ...(sprites.bwStatic.has(pid) ? { bw: true } : {}),
        ...(f?.is_battle_only === "1" ? { battleOnly: true } : {}),
      });
      formDetails.push({
        pid,
        abilities: abilitiesOf(pid),
        moves: formMoves,
        cards: formCards
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 12),
      });
    }
    if (formTags.size) record.forms = [...formTags];

    // Pokédex entries: dedupe identical text across games, newest first.
    const entries = new Map();
    for (const r of (flavorBySpecies.get(s.id) ?? []).sort((a, b) => versionOrder(b.version_id) - versionOrder(a.version_id))) {
      const text = cleanText(r.flavor_text);
      const key = text.toLowerCase().replace(/[^a-z0-9]/g, "");
      const game = versionNames.get(r.version_id) ?? r.version_id;
      if (!entries.has(key)) entries.set(key, { games: [game], text });
      else if (!entries.get(key).games.includes(game)) entries.get(key).games.push(game);
    }
    const flavor = [...entries.values()];

    const abilities = (pokemonAbilities.get(p.id) ?? [])
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .map((a) => ({
        name: abilityNames.get(a.ability_id) ?? a.ability_id,
        hidden: a.is_hidden === "1",
        description: abilityText.get(a.ability_id)?.text ?? "",
      }));

    const moves = pickLearnset(Number(p.id));
    if (moves) coverage.moves++;
    const cards = pickCards(id);
    if (cards.length) coverage.cards++;
    const evolution = evolutionTree(s.evolution_chain_id);

    const detail = {
      id,
      flavor,
      abilities,
      eggGroups: (speciesEggGroups.get(s.id) ?? []).map((e) => eggGroupNames.get(e.egg_group_id) ?? e.egg_group_id),
      genderRate: Number(s.gender_rate),
      hatchCounter: num(s.hatch_counter),
      baseHappiness: num(s.base_happiness),
      growthRate: growthNames.get(s.growth_rate_id) ?? null,
      habitat: habitatNames.get(s.habitat_id) ?? null,
      color: colorNames.get(s.color_id) ?? null,
      shape: shapeNames.get(s.shape_id) ?? null,
      evolution,
      moves,
      cards,
      ...(defaultLabel ? { formLabel: defaultLabel } : {}),
      ...(formDetails.length ? { forms: formDetails } : {}),
    };
    fs.writeFileSync(path.join(OUT, "pokemon", `${id}.json`), JSON.stringify(detail));

    const evolvesTo = [];
    (function walk(node, parentIsSelf) {
      if (!node) return;
      for (const c of node.children) {
        if (parentIsSelf) evolvesTo.push(c.name);
        walk(c, c.id === id);
      }
    })(evolution, evolution?.id === id);
    facts[id] = {
      name: speciesName,
      genus: record.genus,
      types: types.map(capitalize),
      generation: record.gen,
      legendary: !!record.legendary,
      mythical: !!record.mythical,
      baby: !!record.baby,
      habitat: detail.habitat,
      heightM: record.height / 10,
      weightKg: record.weight / 10,
      captureRate: record.capture,
      abilities: abilities.map((a) => (a.hidden ? `${a.name} (hidden)` : a.name)),
      evolvesFrom: s.evolves_from_species_id ? name(s.evolves_from_species_id) : null,
      evolvesTo,
      pokedex: flavor.slice(0, 4).map((f) => f.text),
    };
  }

  // Moves dictionary: [name, type, category, power, accuracy, pp, priority, battle meta]
  const moveMeta = new Map(readCSV("move_meta").map((r) => [r.move_id, r]));
  const moveStatChanges = groupBy(readCSV("move_meta_stat_changes"), "move_id");
  const moveDict = {};
  for (const id of [...usedMoves].sort((a, b) => a - b)) {
    const m = movesData.get(String(id));
    if (!m) continue;
    const meta = moveMeta.get(String(id));
    const battle = {};
    if (meta) {
      const n = (k) => Number(meta[k] || 0);
      if (n("meta_category_id")) battle.c = n("meta_category_id");
      if (n("meta_ailment_id") > 0) battle.a = n("meta_ailment_id");
      if (n("ailment_chance")) battle.ac = n("ailment_chance");
      if (meta.min_hits) battle.h = [n("min_hits"), n("max_hits")];
      if (n("drain")) battle.d = n("drain");
      if (n("healing")) battle.hl = n("healing");
      if (n("crit_rate")) battle.cr = n("crit_rate");
      if (n("flinch_chance")) battle.f = n("flinch_chance");
      if (n("stat_chance")) battle.sc = n("stat_chance");
    }
    const changes = (moveStatChanges.get(String(id)) ?? []).map((r) => [Number(r.stat_id), Number(r.change)]);
    if (changes.length) battle.s = changes;
    if (m.target_id === "7") battle.self = 1;
    if (MOVE_FX[m.identifier]) battle.fx = MOVE_FX[m.identifier];
    if (MOVE_TURN[m.identifier]) battle.tt = MOVE_TURN[m.identifier];
    moveDict[id] = [
      moveNames.get(String(id)) ?? m.identifier,
      typeIdentifiers.get(m.type_id) ?? "normal",
      { 1: "status", 2: "physical", 3: "special" }[m.damage_class_id] ?? "status",
      num(m.power),
      num(m.accuracy),
      num(m.pp),
      Number(m.priority || 0),
      battle,
    ];
  }

  // Per-game sprite availability (front / back / animation / box icons).
  const games = GAMES.map((g) => {
    const ext = g.ext ?? "png";
    const front = tree.list(`versions/${g.front}`, ext);
    const out = {
      id: g.id,
      name: g.name,
      gen: g.gen,
      year: g.year,
      versions: g.versions,
      front: g.front,
      ext,
      ids: toRanges(front),
      cry: g.gen <= 5 ? "legacy" : "latest",
    };
    if (g.back) Object.assign(out, { back: g.back, backExt: g.backExt ?? ext, backIds: toRanges(tree.list(`versions/${g.back}`, g.backExt ?? ext)) });
    if (g.anim) Object.assign(out, { anim: g.anim, animExt: g.animExt, animIds: toRanges(tree.list(`versions/${g.anim}`, g.animExt)) });
    if (g.animBack) Object.assign(out, { animBack: g.animBack, animBackIds: toRanges(tree.list(`versions/${g.animBack}`, g.animExt)) });
    if (g.icon) Object.assign(out, { icon: g.icon, iconIds: toRanges(tree.list(`versions/${g.icon}`, "png")) });
    return out;
  });

  // Type chart (18 standard types)
  const typeList = [...typeIdentifiers.entries()].filter(([tid]) => Number(tid) <= 18).map(([tid, ident]) => ({ tid, ident }));
  const chart = {};
  for (const { ident } of typeList) chart[ident] = {};
  for (const r of readCSV("type_efficacy")) {
    const atk = typeIdentifiers.get(r.damage_type_id);
    const def = typeIdentifiers.get(r.target_type_id);
    if (chart[atk] && typeList.some((t) => t.ident === def)) chart[atk][def] = Number(r.damage_factor) / 100;
  }

  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
  fs.writeFileSync(path.join(OUT, "moves.json"), JSON.stringify(moveDict));
  fs.writeFileSync(path.join(OUT, "forms.json"), JSON.stringify(formIndex));
  fs.writeFileSync(path.join(OUT, "games.json"), JSON.stringify(games));
  fs.writeFileSync(
    path.join(OUT, "types.json"),
    JSON.stringify({ types: typeList.map((t) => ({ id: t.ident, name: typeNames.get(t.tid) ?? capitalize(t.ident) })), chart }),
  );
  fs.writeFileSync(
    path.join(OUT, "meta.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        species: index.length,
        sources: {
          pokeapi: "https://github.com/PokeAPI/pokeapi (data/v2/csv)",
          cards: "https://github.com/PokemonTCG/pokemon-tcg-data",
          sprites: "https://github.com/PokeAPI/sprites",
          artwork: "https://archives.bulbagarden.net",
        },
        coverage: { ...coverage, spriteListExact: sprites.exact, tcgCardsIndexed: cardTotal },
      },
      null,
      2,
    ) + "\n",
  );
  fs.mkdirSync(path.dirname(FUNCTIONS_OUT), { recursive: true });
  fs.writeFileSync(FUNCTIONS_OUT, JSON.stringify(facts));

  log(`wrote ${index.length} species, ${formIndex.length} forms, ${Object.keys(moveDict).length} moves, ${games.length} games`);
  log(`coverage: ${JSON.stringify(coverage)} (TCG cards indexed: ${cardTotal})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
