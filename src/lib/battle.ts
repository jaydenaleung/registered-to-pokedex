import { multiplier } from "./typeChart";
import type { Learnset, MoveBattleMeta, MoveDict, TypeData } from "./types";

/**
 * Battle simulator (beta) — INSTRUCTIONS.md §12.
 *
 * Single battles with Gen V+ mechanics: damage formula, STAB, type chart, critical hits,
 * random spread, accuracy, priority & Speed order, multi-hit, drain/recoil, healing,
 * stat stages, major status (paralysis, burn, poison, sleep, freeze), flinching, charge-up
 * and recharge turns, and Focus Punch.
 * Not simulated: abilities, held items, weather/terrain, switching, semi-invulnerable turns.
 */

export type Side = "player" | "foe";
export type Status = "par" | "brn" | "psn" | "slp" | "frz" | null;
export type StatKey = "atk" | "def" | "spa" | "spd" | "spe";
export type Category = "physical" | "special" | "status";

export interface Rng {
  next(): number;
}

/** Small deterministic PRNG so battles can be replayed in tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export const mathRandom: Rng = { next: () => Math.random() };

export interface BattleMove {
  id: number;
  name: string;
  type: string;
  category: Category;
  power: number | null;
  accuracy: number | null;
  pp: number;
  maxPp: number;
  priority: number;
  meta: MoveBattleMeta;
}

export interface Battler {
  pid: number;
  name: string;
  types: string[];
  level: number;
  weight: number;
  stats: Record<"hp" | StatKey, number>;
  hp: number;
  status: Status;
  sleepTurns: number;
  stages: Record<StatKey, number>;
  moves: BattleMove[];
  /** Must skip its next turn (after Hyper Beam & co.). */
  recharge: boolean;
  /** Charging a two-turn move; it fires next turn. */
  charging: BattleMove | null;
}

export interface BattleState {
  player: Battler;
  foe: Battler;
  turn: number;
  /** Winner once the battle is over. */
  winner: Side | null;
}

export type BattleEvent =
  | { kind: "text"; text: string }
  | { kind: "use"; side: Side; move: string; type: string }
  | { kind: "hp"; side: Side; hp: number; delta: number }
  | { kind: "status"; side: Side; status: Status }
  | { kind: "faint"; side: Side };

export interface MonInput {
  pid: number;
  name: string;
  types: string[];
  /** Base stats: HP, Atk, Def, SpA, SpD, Spe */
  stats: number[];
  /** hectograms */
  weight: number;
}

const STAT_KEYS: StatKey[] = ["atk", "def", "spa", "spd", "spe"];
const STAT_NAMES: Record<StatKey, string> = { atk: "Attack", def: "Defense", spa: "Sp. Atk", spd: "Sp. Def", spe: "Speed" };
const STAT_ID: Record<number, StatKey> = { 2: "atk", 3: "def", 4: "spa", 5: "spd", 6: "spe" };
const AILMENT: Record<number, Status> = { 1: "par", 2: "slp", 3: "frz", 4: "brn", 5: "psn" };
const STATUS_TEXT: Record<Exclude<Status, null>, string> = {
  par: "is paralyzed! It may be unable to move!",
  brn: "was burned!",
  psn: "was poisoned!",
  slp: "fell asleep!",
  frz: "was frozen solid!",
};
const STATUS_IMMUNE: Record<Exclude<Status, null>, string[]> = {
  par: ["electric"],
  brn: ["fire"],
  psn: ["poison", "steel"],
  frz: ["ice"],
  slp: [],
};

/** Level-L stats with perfect IVs, no EVs and a neutral nature. */
export function calcStats(base: number[], level: number): Record<"hp" | StatKey, number> {
  const core = (b: number) => Math.floor(((2 * b + 31) * level) / 100);
  return {
    hp: core(base[0]) + level + 10,
    atk: core(base[1]) + 5,
    def: core(base[2]) + 5,
    spa: core(base[3]) + 5,
    spd: core(base[4]) + 5,
    spe: core(base[5]) + 5,
  };
}

export function toBattleMove(id: number, dict: MoveDict): BattleMove | null {
  const m = dict[id];
  if (!m) return null;
  return {
    id,
    name: m[0],
    type: m[1],
    category: m[2],
    power: m[3],
    accuracy: m[4],
    pp: m[5] ?? 10,
    maxPp: m[5] ?? 10,
    priority: m[6] ?? 0,
    meta: m[7] ?? {},
  };
}

export function makeBattler(mon: MonInput, moveIds: number[], dict: MoveDict, level: number): Battler {
  const stats = calcStats(mon.stats, level);
  return {
    pid: mon.pid,
    name: mon.name,
    types: mon.types,
    level,
    weight: mon.weight,
    stats,
    hp: stats.hp,
    status: null,
    sleepTurns: 0,
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: moveIds.map((id) => toBattleMove(id, dict)).filter((m): m is BattleMove => !!m),
    recharge: false,
    charging: null,
  };
}

/** Moves a Pokémon could know at this level (level-up up to L, plus TM, tutor and egg moves). */
export function learnableMoves(learnset: Learnset | null, level: number): number[] {
  if (!learnset) return [];
  const ids = new Set<number>();
  for (const [lvl, id] of learnset.level) if (lvl <= level) ids.add(id);
  [...learnset.machine, ...learnset.tutor, ...learnset.egg].forEach((id) => ids.add(id));
  return [...ids];
}

/** Does this move do something in the simulator? */
export function isSimulated(move: Pick<BattleMove, "power" | "category" | "meta">): boolean {
  if (move.power !== null || move.meta.fx) return true;
  const c = move.meta.c ?? 0;
  return c === 1 || c === 2 || c === 3;
}

const effectivePower = (m: Pick<BattleMove, "power" | "meta">) => m.power ?? (m.meta.fx === "ohko" ? 0 : 60);

/** A sensible default moveset: strongest damaging moves of different types, STAB preferred. */
export function defaultMoveset(candidates: number[], dict: MoveDict, types: string[], max = 4): number[] {
  const moves = candidates.map((id) => toBattleMove(id, dict)).filter((m): m is BattleMove => !!m && isSimulated(m));
  const score = (m: BattleMove) =>
    m.category === "status" || m.meta.fx === "ohko"
      ? 0
      : effectivePower(m) *
        ((m.accuracy ?? 100) / 100) *
        (types.includes(m.type) ? 1.5 : 1) *
        (m.meta.h ? 2.5 : 1) *
        (m.meta.d && m.meta.d < 0 ? 0.85 : 1) *
        (m.meta.tt === "recharge" || m.meta.tt === "charge" ? 0.55 : m.meta.tt === "focus" ? 0.5 : 1);
  const damaging = moves.filter((m) => score(m) > 0).sort((a, b) => score(b) - score(a));
  const picked: BattleMove[] = [];
  for (const m of damaging) {
    if (picked.length >= max) break;
    if (!picked.some((p) => p.type === m.type)) picked.push(m);
  }
  for (const m of damaging) {
    if (picked.length >= max) break;
    if (!picked.includes(m)) picked.push(m);
  }
  const support = moves
    .filter((m) => m.category === "status" && (m.meta.c === 2 || m.meta.c === 3) && (m.meta.self || (m.meta.s ?? []).some(([, c]) => c > 0)))
    .sort((a, b) => (b.meta.hl ?? 0) - (a.meta.hl ?? 0));
  for (const m of support) {
    if (picked.length >= max) break;
    picked.push(m);
  }
  return picked.map((m) => m.id);
}

const stageMultiplier = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));

function speedOf(b: Battler): number {
  return b.stats.spe * stageMultiplier(b.stages.spe) * (b.status === "par" ? 0.5 : 1);
}

const CRIT_CHANCE = [1 / 24, 1 / 8, 1 / 2, 1];

function clone(state: BattleState): BattleState {
  const copy = (b: Battler): Battler => {
    const moves = b.moves.map((m) => ({ ...m }));
    const charging = b.charging ? (moves.find((m) => m.id === b.charging!.id) ?? { ...b.charging }) : null;
    return { ...b, stats: { ...b.stats }, stages: { ...b.stages }, moves, charging };
  };
  return { ...state, player: copy(state.player), foe: copy(state.foe) };
}

const STRUGGLE: BattleMove = {
  id: 165,
  name: "Struggle",
  type: "typeless",
  category: "physical",
  power: 50,
  accuracy: null,
  pp: 1,
  maxPp: 1,
  priority: 0,
  meta: { d: -25 },
};

function variablePower(move: BattleMove, user: Battler, target: Battler): number {
  const fx = move.meta.fx;
  const kg = target.weight / 10;
  switch (fx) {
    case "weight":
      return kg < 10 ? 20 : kg < 25 ? 40 : kg < 50 ? 60 : kg < 100 ? 80 : kg < 200 ? 100 : 120;
    case "heavier": {
      const ratio = user.weight / Math.max(1, target.weight);
      return ratio >= 5 ? 120 : ratio >= 4 ? 100 : ratio >= 3 ? 80 : ratio >= 2 ? 60 : 40;
    }
    case "p102":
      return 102;
    case "lowhp": {
      const p = Math.floor((48 * user.hp) / user.stats.hp);
      return p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20;
    }
    case "gyro":
      return Math.min(150, Math.floor((25 * speedOf(target)) / Math.max(1, speedOf(user))) + 1);
    case "electro": {
      const r = speedOf(user) / Math.max(1, speedOf(target));
      return r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40;
    }
    default:
      return move.power ?? 60;
  }
}

/** Expected damage, used by the opponent's AI. */
function estimate(move: BattleMove, user: Battler, target: Battler, chart: TypeData["chart"]): number {
  if (move.pp <= 0) return -1;
  const eff = move.type === "typeless" ? 1 : multiplier(move.type, target.types, chart);
  if (move.category === "status") {
    const c = move.meta.c ?? 0;
    if (c === 3) return user.hp < user.stats.hp * 0.4 ? 999 : 0;
    if (c === 1) {
      const ailment = AILMENT[move.meta.a ?? 0];
      return ailment && !target.status && !STATUS_IMMUNE[ailment].some((t) => target.types.includes(t)) ? 35 : 0;
    }
    if (c === 2) return user.hp > user.stats.hp * 0.6 ? 25 : 5;
    return 0;
  }
  if (eff === 0) return 0;
  if (move.meta.fx === "ohko") return target.hp * 0.3;
  if (move.meta.fx === "level") return user.level;
  if (move.meta.fx === "half") return target.hp / 2;
  const physical = move.category === "physical";
  const a = physical ? user.stats.atk : user.stats.spa;
  const d = physical ? target.stats.def : target.stats.spd;
  const power = variablePower(move, user, target);
  const hits = move.meta.h ? (move.meta.h[0] + move.meta.h[1]) / 2 : 1;
  const slow = move.meta.tt === "charge" || move.meta.tt === "recharge" ? 0.6 : move.meta.tt === "focus" ? 0.5 : 1;
  return power * (a / d) * eff * (user.types.includes(move.type) ? 1.5 : 1) * ((move.accuracy ?? 100) / 100) * hits * slow;
}

export function chooseFoeMove(state: BattleState, chart: TypeData["chart"], rng: Rng = mathRandom): number {
  const { foe, player } = state;
  const usable = foe.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.pp > 0);
  if (!usable.length) return -1;
  if (rng.next() < 0.15) return usable[Math.floor(rng.next() * usable.length)].i;
  let best = usable[0];
  let bestScore = -Infinity;
  for (const u of usable) {
    const s = estimate(u.m, foe, player, chart) * (0.85 + rng.next() * 0.3);
    if (s > bestScore) {
      bestScore = s;
      best = u;
    }
  }
  return best.i;
}

interface Ctx {
  state: BattleState;
  chart: TypeData["chart"];
  rng: Rng;
  events: BattleEvent[];
  flinched: Set<Side>;
  hurt: Set<Side>;
}

const other = (side: Side): Side => (side === "player" ? "foe" : "player");
const label = (ctx: Ctx, side: Side) => (side === "foe" ? `The foe's ${ctx.state.foe.name}` : ctx.state.player.name);

function say(ctx: Ctx, text: string) {
  ctx.events.push({ kind: "text", text });
}

function setHp(ctx: Ctx, side: Side, hp: number) {
  const b = ctx.state[side];
  const next = Math.max(0, Math.min(b.stats.hp, Math.round(hp)));
  if (next === b.hp) return;
  ctx.events.push({ kind: "hp", side, hp: next, delta: next - b.hp });
  if (next < b.hp) ctx.hurt.add(side);
  b.hp = next;
}

function checkFaint(ctx: Ctx, side: Side): boolean {
  if (ctx.state[side].hp > 0) return false;
  if (ctx.state.winner) return true;
  ctx.events.push({ kind: "faint", side });
  say(ctx, `${label(ctx, side)} fainted!`);
  ctx.state.winner = other(side);
  return true;
}

function applyStatus(ctx: Ctx, side: Side, status: Exclude<Status, null>, announceFail: boolean): boolean {
  const b = ctx.state[side];
  if (b.status || STATUS_IMMUNE[status].some((t) => b.types.includes(t))) {
    if (announceFail) say(ctx, "But it failed!");
    return false;
  }
  b.status = status;
  if (status === "slp") b.sleepTurns = 1 + Math.floor(ctx.rng.next() * 3);
  ctx.events.push({ kind: "status", side, status });
  say(ctx, `${label(ctx, side)} ${STATUS_TEXT[status]}`);
  return true;
}

function changeStat(ctx: Ctx, side: Side, stat: StatKey, change: number) {
  const b = ctx.state[side];
  const before = b.stages[stat];
  const after = Math.max(-6, Math.min(6, before + change));
  const who = label(ctx, side);
  if (after === before) {
    say(ctx, `${who}'s ${STAT_NAMES[stat]} won't go any ${change > 0 ? "higher" : "lower"}!`);
    return;
  }
  b.stages[stat] = after;
  const size = Math.abs(change);
  const verb = change > 0 ? (size >= 3 ? "rose drastically" : size === 2 ? "rose sharply" : "rose") : size >= 3 ? "fell severely" : size === 2 ? "harshly fell" : "fell";
  say(ctx, `${who}'s ${STAT_NAMES[stat]} ${verb}!`);
}

function applyStatChanges(ctx: Ctx, user: Side, move: BattleMove, damaging: boolean) {
  const changes = move.meta.s ?? [];
  if (!changes.length) return;
  const chance = move.meta.sc ?? 0;
  if (damaging && chance > 0 && ctx.rng.next() * 100 >= chance) return;
  const c = move.meta.c ?? 0;
  for (const [statId, change] of changes) {
    const stat = STAT_ID[statId];
    if (!stat) continue;
    // Damage+raise (7) and self-targeting moves change the user's stats; others the target's.
    const onUser = c === 7 || !!move.meta.self || (c === 2 && change > 0);
    const side = onUser ? user : other(user);
    if (ctx.state[side].hp <= 0) continue;
    changeStat(ctx, side, stat, change);
  }
}

function canAct(ctx: Ctx, side: Side): boolean {
  const b = ctx.state[side];
  const who = label(ctx, side);
  if (b.status === "slp") {
    if (b.sleepTurns > 0) {
      b.sleepTurns--;
      say(ctx, `${who} is fast asleep.`);
      return false;
    }
    b.status = null;
    ctx.events.push({ kind: "status", side, status: null });
    say(ctx, `${who} woke up!`);
  }
  if (b.status === "frz") {
    if (ctx.rng.next() < 0.2) {
      b.status = null;
      ctx.events.push({ kind: "status", side, status: null });
      say(ctx, `${who} thawed out!`);
    } else {
      say(ctx, `${who} is frozen solid!`);
      return false;
    }
  }
  if (ctx.flinched.has(side)) {
    say(ctx, `${who} flinched and couldn't move!`);
    return false;
  }
  if (b.status === "par" && ctx.rng.next() < 0.25) {
    say(ctx, `${who} is paralyzed! It can't move!`);
    return false;
  }
  return true;
}

function damageRoll(ctx: Ctx, move: BattleMove, user: Battler, target: Battler, eff: number): { damage: number; crit: boolean } {
  const fx = move.meta.fx;
  if (fx === "level") return { damage: user.level, crit: false };
  if (fx === "fixed20") return { damage: 20, crit: false };
  if (fx === "fixed40") return { damage: 40, crit: false };
  if (fx === "half") return { damage: Math.max(1, Math.floor(target.hp / 2)), crit: false };
  const crit = ctx.rng.next() < CRIT_CHANCE[Math.min(3, move.meta.cr ?? 0)];
  const physical = move.category === "physical";
  const atkKey: StatKey = physical ? "atk" : "spa";
  const defKey: StatKey = physical ? "def" : "spd";
  // Critical hits ignore the attacker's drops and the defender's boosts.
  const atkStage = crit ? Math.max(0, user.stages[atkKey]) : user.stages[atkKey];
  const defStage = crit ? Math.min(0, target.stages[defKey]) : target.stages[defKey];
  const a = user.stats[atkKey] * stageMultiplier(atkStage);
  const d = target.stats[defKey] * stageMultiplier(defStage);
  const power = variablePower(move, user, target);
  const base = Math.floor(Math.floor((Math.floor((2 * user.level) / 5 + 2) * power * a) / d) / 50) + 2;
  const random = (85 + Math.floor(ctx.rng.next() * 16)) / 100;
  const stab = user.types.includes(move.type) ? 1.5 : 1;
  const burn = physical && user.status === "brn" ? 0.5 : 1;
  const damage = Math.max(1, Math.floor(base * random * stab * eff * (crit ? 1.5 : 1) * burn));
  return { damage, crit };
}

function hitCount(ctx: Ctx, move: BattleMove): number {
  const [min, max] = move.meta.h ?? [1, 1];
  if (min === max) return min;
  if (min === 2 && max === 5) {
    const r = ctx.rng.next();
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
  }
  return min + Math.floor(ctx.rng.next() * (max - min + 1));
}

const CHARGE_TEXT: Record<string, string> = {
  Fly: "flew up high!",
  Dig: "burrowed its way under the ground!",
  Dive: "hid underwater!",
  Bounce: "sprang up!",
  "Solar Beam": "absorbed light!",
  "Solar Blade": "absorbed light!",
  "Skull Bash": "tucked in its head!",
  "Sky Attack": "became cloaked in a harsh light!",
  "Phantom Force": "vanished instantly!",
  "Shadow Force": "vanished instantly!",
};

function useMove(ctx: Ctx, side: Side, move: BattleMove, movesFirst: boolean) {
  const userSide = side;
  const targetSide = other(side);
  const user = ctx.state[userSide];
  const target = ctx.state[targetSide];
  const releasing = user.charging === move;

  if (move.meta.tt === "focus" && ctx.hurt.has(userSide)) {
    say(ctx, `${label(ctx, userSide)} lost its focus and couldn't move!`);
    if (move !== STRUGGLE) move.pp = Math.max(0, move.pp - 1);
    return;
  }
  if (!releasing && move !== STRUGGLE) move.pp = Math.max(0, move.pp - 1);

  // Turn one of a two-turn move: charge up and stop.
  if (move.meta.tt === "charge" && !releasing) {
    user.charging = move;
    say(ctx, `${label(ctx, userSide)} ${CHARGE_TEXT[move.name] ?? "is gathering power!"}`);
    return;
  }
  if (releasing) user.charging = null;

  say(ctx, `${label(ctx, userSide)} used ${move.name}!`);
  ctx.events.push({ kind: "use", side: userSide, move: move.name, type: move.type });

  const selfTargeting = !!move.meta.self || move.meta.c === 3;
  if (!selfTargeting && move.accuracy !== null && move.meta.fx !== "ohko" && ctx.rng.next() * 100 >= move.accuracy) {
    say(ctx, `${label(ctx, userSide)}'s attack missed!`);
    return;
  }

  // ----- status moves
  if (move.category === "status" && move.power === null && !move.meta.fx) {
    const c = move.meta.c ?? 0;
    if (c === 1) {
      const ailment = AILMENT[move.meta.a ?? 0];
      if (ailment) applyStatus(ctx, targetSide, ailment, true);
      else say(ctx, "But nothing happened! (not simulated in this beta)");
    } else if (c === 2) {
      applyStatChanges(ctx, userSide, move, false);
    } else if (c === 3) {
      if (user.hp >= user.stats.hp) say(ctx, `${label(ctx, userSide)}'s HP is full!`);
      else {
        setHp(ctx, userSide, user.hp + (user.stats.hp * (move.meta.hl ?? 50)) / 100);
        say(ctx, `${label(ctx, userSide)} regained health!`);
      }
    } else {
      say(ctx, "But nothing happened! (not simulated in this beta)");
    }
    return;
  }

  // ----- damaging moves
  const eff = move.type === "typeless" ? 1 : multiplier(move.type, target.types, ctx.chart);
  if (eff === 0) {
    say(ctx, `It doesn't affect ${label(ctx, targetSide).replace("The foe's", "the foe's")}…`);
    return;
  }
  if (move.meta.fx === "ohko") {
    const chance = 30 + Math.max(0, user.level - target.level);
    if (user.level < target.level || ctx.rng.next() * 100 >= chance) {
      say(ctx, `${label(ctx, userSide)}'s attack missed!`);
      return;
    }
    setHp(ctx, targetSide, 0);
    say(ctx, "It's a one-hit KO!");
    checkFaint(ctx, targetSide);
    return;
  }

  const hits = hitCount(ctx, move);
  let total = 0;
  let landed = 0;
  for (let i = 0; i < hits && target.hp > 0; i++) {
    const { damage, crit } = damageRoll(ctx, move, user, target, move.meta.fx ? 1 : eff);
    const dealt = Math.min(damage, target.hp);
    setHp(ctx, targetSide, target.hp - dealt);
    total += dealt;
    landed++;
    if (crit) say(ctx, "A critical hit!");
  }
  if (!move.meta.fx) {
    if (eff > 1) say(ctx, "It's super effective!");
    else if (eff < 1) say(ctx, "It's not very effective…");
  }
  if (hits > 1) say(ctx, `It hit ${landed} time${landed === 1 ? "" : "s"}!`);

  // Drain / recoil
  const drain = move === STRUGGLE ? 0 : (move.meta.d ?? 0);
  if (move === STRUGGLE) {
    setHp(ctx, userSide, user.hp - Math.max(1, Math.floor(user.stats.hp / 4)));
    say(ctx, `${label(ctx, userSide)} is hit with recoil!`);
  } else if (drain > 0 && user.hp < user.stats.hp) {
    setHp(ctx, userSide, user.hp + Math.max(1, Math.floor((total * drain) / 100)));
    say(ctx, `${label(ctx, targetSide)} had its energy drained!`);
  } else if (drain < 0) {
    setHp(ctx, userSide, user.hp - Math.max(1, Math.floor((total * -drain) / 100)));
    say(ctx, `${label(ctx, userSide)} is damaged by recoil!`);
  }

  const targetFainted = checkFaint(ctx, targetSide);
  const userFainted = checkFaint(ctx, userSide);
  if (userFainted) return;
  if (move.meta.tt === "recharge") user.recharge = true;

  // Secondary effects
  if (!targetFainted) {
    const ailment = AILMENT[move.meta.a ?? 0];
    if (ailment && (move.meta.ac ?? 0) > 0 && ctx.rng.next() * 100 < (move.meta.ac ?? 0)) applyStatus(ctx, targetSide, ailment, false);
    if (movesFirst && (move.meta.f ?? 0) > 0 && ctx.rng.next() * 100 < (move.meta.f ?? 0)) ctx.flinched.add(targetSide);
  }
  if ((move.meta.c === 6 && !targetFainted) || move.meta.c === 7) applyStatChanges(ctx, userSide, move, true);
}

function endOfTurn(ctx: Ctx) {
  for (const side of ["player", "foe"] as Side[]) {
    if (ctx.state.winner) return;
    const b = ctx.state[side];
    if (b.hp <= 0) continue;
    if (b.status === "brn" || b.status === "psn") {
      const fraction = b.status === "brn" ? 16 : 8;
      setHp(ctx, side, b.hp - Math.max(1, Math.floor(b.stats.hp / fraction)));
      say(ctx, `${label(ctx, side)} is hurt by its ${b.status === "brn" ? "burn" : "poison"}!`);
      checkFaint(ctx, side);
    }
  }
}

/** Plays one full turn. Pure: returns a new state plus the events to animate. */
export function runTurn(
  state: BattleState,
  playerMoveIndex: number,
  chart: TypeData["chart"],
  rng: Rng = mathRandom,
  foeMoveIndex: number = chooseFoeMove(state, chart, rng),
): { state: BattleState; events: BattleEvent[] } {
  const ctx: Ctx = { state: clone(state), chart, rng, events: [], flinched: new Set(), hurt: new Set() };
  if (ctx.state.winner) return { state: ctx.state, events: [] };

  const RECHARGE: BattleMove = { ...STRUGGLE, id: -1, name: "Recharge", priority: 0 };
  const pick = (side: Side, index: number): BattleMove => {
    const b = ctx.state[side];
    if (b.recharge) return RECHARGE;
    if (b.charging) return b.charging;
    const m = b.moves[index];
    return m && m.pp > 0 ? m : b.moves.some((x) => x.pp > 0) ? b.moves.find((x) => x.pp > 0)! : STRUGGLE;
  };
  const chosen: Record<Side, BattleMove> = { player: pick("player", playerMoveIndex), foe: pick("foe", foeMoveIndex) };
  if (chosen.player === STRUGGLE) say(ctx, `${ctx.state.player.name} has no moves left!`);

  const order: Side[] = (() => {
    const p = chosen.player.priority;
    const f = chosen.foe.priority;
    if (p !== f) return p > f ? ["player", "foe"] : ["foe", "player"];
    const sp = speedOf(ctx.state.player);
    const sf = speedOf(ctx.state.foe);
    if (sp !== sf) return sp > sf ? ["player", "foe"] : ["foe", "player"];
    return ctx.rng.next() < 0.5 ? ["player", "foe"] : ["foe", "player"];
  })();

  for (const side of order) {
    if (chosen[side].meta.tt === "focus" && chosen[side] !== ctx.state[side].charging) say(ctx, `${label(ctx, side)} is tightening its focus!`);
  }

  order.forEach((side, i) => {
    if (ctx.state.winner || ctx.state[side].hp <= 0) return;
    const b = ctx.state[side];
    if (chosen[side] === RECHARGE) {
      b.recharge = false;
      say(ctx, `${label(ctx, side)} must recharge!`);
      return;
    }
    if (!canAct(ctx, side)) {
      b.charging = null;
      return;
    }
    useMove(ctx, side, chosen[side], i === 0);
  });

  endOfTurn(ctx);
  ctx.state.turn++;
  return { state: ctx.state, events: ctx.events };
}

export function newBattle(player: Battler, foe: Battler): BattleState {
  return { player, foe, turn: 1, winner: null };
}

export const STAT_KEYS_LIST = STAT_KEYS;

/** The player can't pick a move this turn (charging or recharging). */
export const isLocked = (b: Battler) => b.recharge || !!b.charging;
