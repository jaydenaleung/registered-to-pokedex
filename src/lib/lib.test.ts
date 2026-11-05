import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ageYears, debutYear, regionFor } from "./age";
import { catchChance, catchScenarios, catchTier } from "./catchRate";
import { applyQuery, exactMatch, getToken, normalize, parseQuery, setToken, suggestions } from "./search";
import { cardImage, officialArt } from "./sprites";
import { defensiveProfile, multiplier } from "./typeChart";
import type { SpeciesDetail, SpeciesSummary, TypeData } from "./types";

const DATA = path.resolve(__dirname, "../../public/data");
const index: SpeciesSummary[] = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
const types: TypeData = JSON.parse(fs.readFileSync(path.join(DATA, "types.json"), "utf8"));
const byName = (n: string) => index.find((s) => s.name === n)!;

describe("generated data", () => {
  it("has every species #1–#1025 in order", () => {
    expect(index).toHaveLength(1025);
    index.forEach((s, i) => expect(s.id).toBe(i + 1));
  });

  it("has a detail file for every species with cards and moves", () => {
    for (const s of index) {
      const d: SpeciesDetail = JSON.parse(fs.readFileSync(path.join(DATA, "pokemon", `${s.id}.json`), "utf8"));
      expect(d.id).toBe(s.id);
      expect(d.evolution).not.toBeNull();
      expect(s.types.length).toBeGreaterThan(0);
      expect(s.stats).toHaveLength(6);
    }
  });

  it("builds Bulbapedia hashed upload paths", () => {
    expect(byName("Bulbasaur").art).toBe("f/fb/0001Bulbasaur.png");
    expect(officialArt(byName("Bulbasaur"))[0]).toBe(
      "https://archives.bulbagarden.net/media/upload/f/fb/0001Bulbasaur.png",
    );
  });
});

describe("type chart", () => {
  it("doubles up weaknesses for dual types", () => {
    const charizard = byName("Charizard");
    expect(multiplier("rock", charizard.types, types.chart)).toBe(4);
    const p = defensiveProfile(charizard.types, types.chart);
    expect(p.quad).toEqual(["rock"]);
    expect(p.double.sort()).toEqual(["electric", "water"]);
    expect(p.immune).toEqual(["ground"]);
    expect(p.quarter.sort()).toEqual(["bug", "grass"]);
  });

  it("handles single types", () => {
    const p = defensiveProfile(["normal"], types.chart);
    expect(p.double).toEqual(["fighting"]);
    expect(p.immune).toEqual(["ghost"]);
  });
});

describe("catch difficulty", () => {
  it("tiers capture rates", () => {
    expect(catchTier(255).label).toBe("Very Easy");
    expect(catchTier(190).label).toBe("Very Easy");
    expect(catchTier(120).label).toBe("Easy");
    expect(catchTier(45).label).toBe("Hard");
    expect(catchTier(3).label).toBe("Extreme");
  });

  it("follows p = (a/255)^(3/4)", () => {
    // Full HP, Poké Ball: a = R/3
    expect(catchChance(255)).toBeCloseTo(Math.pow(1 / 3, 0.75), 6);
    // Ultra Ball, ~0 HP, asleep on R=255 is guaranteed
    expect(catchChance(255, { ball: 2, status: 2.5, hpFraction: 0 })).toBe(1);
    const legend = catchScenarios(3);
    expect(legend.pokeBallFullHp).toBeLessThan(0.05);
    expect(legend.expectedBalls).toBeGreaterThan(20);
  });
});

describe("age", () => {
  it("counts years since debut", () => {
    expect(debutYear(1, 1)).toBe(1996);
    expect(debutYear(808, 7)).toBe(2018);
    expect(debutYear(1025, 9)).toBe(2024);
    expect(ageYears(25, 1, new Date("2026-11-05"))).toBe(30);
    expect(regionFor(902, 8)).toBe("Hisui");
  });
});

describe("search", () => {
  const ctx = { chart: types.chart };
  const run = (q: string) => applyQuery(index, parseQuery(q), ctx);

  it("finds by name, ignoring case, accents and punctuation", () => {
    expect(run("pika").map((s) => s.name)).toContain("Pikachu");
    expect(run("flabebe").map((s) => s.name)).toEqual(["Flabébé"]);
    expect(run("mr mime").map((s) => s.name)).toEqual(["Mr. Mime"]);
    expect(normalize("Farfetch’d")).toBe("farfetchd");
  });

  it("finds by number and range", () => {
    expect(run("#25").map((s) => s.id)).toEqual([25]);
    expect(run("25")[0].name).toBe("Pikachu");
    expect(run("1-151")).toHaveLength(151);
  });

  it("filters by type, generation, region, flags and weakness", () => {
    expect(run("type:fire type:flying").map((s) => s.name)).toContain("Charizard");
    expect(run("fire gen:1").every((s) => s.gen === 1 && s.types.includes("fire"))).toBe(true);
    expect(run("hoenn").every((s) => s.gen === 3)).toBe(true);
    expect(run("gen3")).toHaveLength(run("gen:iii").length);
    expect(run("legendary").map((s) => s.name)).toContain("Mewtwo");
    expect(run("mythical").map((s) => s.name)).toContain("Mew");
    expect(run("weak:ice").map((s) => s.name)).toContain("Dragonite");
    expect(run("weak:ice").map((s) => s.name)).not.toContain("Pikachu");
  });

  it("sorts", () => {
    expect(run("sort:catch")[0].capture).toBe(3);
    expect(run("sort:bst")[0].name).toBe("Arceus");
    const votes = new Map([
      [7, { up: 10, down: 0 }],
      [4, { up: 3, down: 1 }],
      [1, { up: 0, down: 5 }],
    ]);
    const top = applyQuery(index, parseQuery("sort:popular 1-9"), { votes }).map((s) => s.id);
    expect(top.slice(0, 2)).toEqual([7, 4]);
    expect(top[top.length - 1]).toBe(1);
  });

  it("filters by caught log", () => {
    const caught = new Set([1, 4]);
    expect(applyQuery(index, parseQuery("caught"), { caught }).map((s) => s.id)).toEqual([1, 4]);
    expect(applyQuery(index, parseQuery("missing 1-5"), { caught }).map((s) => s.id)).toEqual([2, 3, 5]);
  });

  it("keeps dropdown tokens in sync with the query", () => {
    expect(setToken("pika fire", "type", "water")).toBe("pika type:water");
    expect(setToken("pika type:water gen:1", "type", null)).toBe("pika gen:1");
    expect(getToken("hoenn pika", "gen")).toBe("3");
    expect(getToken("popular", "sort")).toBe("popular");
    expect(setToken("kanto x", "gen", "2")).toBe("x gen:2");
  });

  it("detects exact matches and suggests names", () => {
    expect(exactMatch("Pikachu", index)?.id).toBe(25);
    expect(exactMatch("#6", index)?.name).toBe("Charizard");
    expect(exactMatch("pika", index)).toBeNull();
    expect(suggestions("char", index).map((s) => s.name).slice(0, 3)).toEqual([
      "Charmander",
      "Charmeleon",
      "Charizard",
    ]);
  });
});

describe("card images", () => {
  it("expands compact pokemontcg paths", () => {
    const card = { id: "x", name: "x", set: "x", date: "", rarity: null, number: "1", artist: null, img: "sv8/1" };
    expect(cardImage(card, "large")).toBe("https://images.pokemontcg.io/sv8/1_hires.png");
    expect(cardImage(card, "small")).toBe("https://images.pokemontcg.io/sv8/1.png");
  });
});
