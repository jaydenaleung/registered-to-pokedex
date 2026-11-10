import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calcStats,
  chooseFoeMove,
  defaultMoveset,
  learnableMoves,
  makeBattler,
  mulberry32,
  newBattle,
  runTurn,
  type BattleState,
} from "./battle";
import type { MoveDict, SpeciesDetail, SpeciesSummary, TypeData } from "./types";

const DATA = path.resolve(__dirname, "../../public/data");
const read = <T,>(f: string): T => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const index = read<SpeciesSummary[]>("index.json");
const moves = read<MoveDict>("moves.json");
const { chart } = read<TypeData>("types.json");
const byName = (n: string) => index.find((s) => s.name === n)!;
const moveId = (n: string) => Number(Object.entries(moves).find(([, m]) => m[0] === n)![0]);
const mon = (n: string) => {
  const s = byName(n);
  return { pid: s.id, name: s.name, types: s.types, stats: s.stats, weight: s.weight };
};
const battle = (a: string, aMoves: string[], b: string, bMoves: string[], level = 50): BattleState =>
  newBattle(makeBattler(mon(a), aMoves.map(moveId), moves, level), makeBattler(mon(b), bMoves.map(moveId), moves, level));
const texts = (events: { kind: string; text?: string }[]) => events.filter((e) => e.kind === "text").map((e) => e.text);

describe("battle stats", () => {
  it("computes level-50 stats with 31 IVs and no EVs", () => {
    expect(calcStats(byName("Pikachu").stats, 50)).toEqual({ hp: 110, atk: 75, def: 60, spa: 70, spd: 70, spe: 110 });
  });
});

describe("damage and type chart", () => {
  it("does ×4 damage to a weak target and nothing to an immune one", () => {
    const rng = mulberry32(1);
    const s = battle("Pikachu", ["Thunderbolt"], "Gyarados", ["Splash"]);
    const { state, events } = runTurn(s, 0, chart, rng, 0);
    expect(texts(events)).toContain("It's super effective!");
    expect(state.foe.hp).toBeLessThan(s.foe.hp * 0.4);

    const immune = runTurn(battle("Pikachu", ["Thunderbolt"], "Diglett", ["Growl"]), 0, chart, mulberry32(2), 0);
    expect(texts(immune.events).some((t) => t?.startsWith("It doesn't affect"))).toBe(true);
    expect(immune.state.foe.hp).toBe(immune.state.foe.stats.hp);
  });

  it("uses the Gen V+ formula within the random range", () => {
    // Lv50 Charizard Flamethrower (90, special, STAB) into Venusaur (×2).
    const s = battle("Charizard", ["Flamethrower"], "Venusaur", ["Growl"]);
    const att = s.player.stats.spa;
    const def = s.foe.stats.spd;
    const base = Math.floor(Math.floor((Math.floor((2 * 50) / 5 + 2) * 90 * att) / def) / 50) + 2;
    const min = Math.floor(base * 0.85 * 1.5 * 2);
    const max = Math.floor(base * 1.5 * 2 * 1.5); // allow a critical hit
    for (let seed = 1; seed < 40; seed++) {
      const { state } = runTurn(s, 0, chart, mulberry32(seed), 0);
      const dealt = s.foe.hp - state.foe.hp;
      expect(dealt).toBeGreaterThanOrEqual(min);
      expect(dealt).toBeLessThanOrEqual(max);
    }
  });
});

describe("turn order and effects", () => {
  it("lets priority moves go first", () => {
    const s = battle("Rattata", ["Quick Attack"], "Electrode", ["Tackle"]);
    const { events } = runTurn(s, 0, chart, mulberry32(3), 0);
    const uses = events.filter((e) => e.kind === "use").map((e) => (e as { side: string }).side);
    expect(uses[0]).toBe("player");
  });

  it("applies stat stages, status, healing and drain", () => {
    const sd = runTurn(battle("Scyther", ["Swords Dance"], "Snorlax", ["Splash"]), 0, chart, mulberry32(4), 0);
    expect(sd.state.player.stages.atk).toBe(2);

    const twave = runTurn(battle("Pikachu", ["Thunder Wave"], "Snorlax", ["Splash"]), 0, chart, mulberry32(5), 0);
    expect(twave.state.foe.status).toBe("par");
    const fail = runTurn(battle("Pikachu", ["Thunder Wave"], "Raichu", ["Splash"]), 0, chart, mulberry32(5), 0);
    expect(fail.state.foe.status).toBeNull();
    expect(texts(fail.events)).toContain("But it failed!");

    const hurt = battle("Chansey", ["Soft-Boiled"], "Machamp", ["Splash"]);
    hurt.player.hp = 50;
    const healed = runTurn(hurt, 0, chart, mulberry32(6), 0);
    expect(healed.state.player.hp).toBeGreaterThan(50);

    const drain = battle("Venusaur", ["Giga Drain"], "Blastoise", ["Splash"]);
    drain.player.hp = 40;
    const drained = runTurn(drain, 0, chart, mulberry32(7), 0);
    expect(drained.state.player.hp).toBeGreaterThan(40);
  });

  it("charges, recharges and loses focus", () => {
    const fly = battle("Pidgeot", ["Fly"], "Snorlax", ["Splash"]);
    const t1 = runTurn(fly, 0, chart, mulberry32(8), 0);
    expect(t1.state.foe.hp).toBe(t1.state.foe.stats.hp);
    expect(texts(t1.events)).toContain("Pidgeot flew up high!");
    const t2 = runTurn(t1.state, 0, chart, mulberry32(9), 0);
    expect(t2.state.foe.hp).toBeLessThan(t2.state.foe.stats.hp);
    expect(t2.state.player.moves[0].pp).toBe(t2.state.player.moves[0].maxPp - 1);

    const beam = runTurn(battle("Snorlax", ["Hyper Beam"], "Onix", ["Splash"]), 0, chart, mulberry32(10), 0);
    expect(beam.state.player.recharge).toBe(true);
    const rest = runTurn(beam.state, 0, chart, mulberry32(11), 0);
    expect(texts(rest.events)).toContain("Snorlax must recharge!");
    expect(rest.state.player.recharge).toBe(false);

    const punch = runTurn(battle("Machamp", ["Focus Punch"], "Jolteon", ["Thunderbolt"]), 0, chart, mulberry32(12), 0);
    expect(texts(punch.events)).toContain("Machamp lost its focus and couldn't move!");
  });

  it("ends with a winner", () => {
    let s = battle("Charizard", ["Flamethrower", "Air Slash", "Dragon Claw", "Slash"], "Blastoise", ["Surf", "Bite", "Ice Beam", "Skull Bash"]);
    const rng = mulberry32(42);
    for (let i = 0; i < 40 && !s.winner; i++) s = runTurn(s, i % 4, chart, rng).state;
    expect(s.winner).not.toBeNull();
    expect(Math.min(s.player.hp, s.foe.hp)).toBe(0);
  });
});

describe("move selection", () => {
  it("builds a strong, varied default moveset and a sensible AI", () => {
    const detail = read<SpeciesDetail>("pokemon/6.json");
    const options = learnableMoves(detail.moves, 50);
    const set = defaultMoveset(options, moves, byName("Charizard").types);
    expect(set).toHaveLength(4);
    const types = set.map((id) => moves[id][1]);
    expect(new Set(types).size).toBeGreaterThanOrEqual(3);
    expect(types).toContain("fire");

    const s = battle("Gyarados", ["Splash"], "Pikachu", ["Thunderbolt", "Growl", "Tail Whip", "Play Nice"]);
    const picks = Array.from({ length: 30 }, (_, i) => chooseFoeMove(s, chart, mulberry32(i)));
    expect(picks.filter((p) => p === 0).length).toBeGreaterThan(20);
  });
});
