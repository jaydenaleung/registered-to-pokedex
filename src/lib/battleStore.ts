import { useSyncExternalStore } from "react";
import {
  defaultMoveset,
  learnableMoves,
  makeBattler,
  newBattle,
  runTurn,
  type BattleEvent,
  type BattleState,
  type Side,
  type Status,
} from "./battle";
import { fetchResource, loadDetail, loadForms, loadIndex, loadMoves, loadTypes } from "./data";
import { cryUrls, formMon, speciesMon } from "./sprites";
import type { GameDef, Learnset, Mon, MoveDict, TypeData } from "./types";

/**
 * Shared state for the battle page. The left page (field) and right page (menus) are
 * separate React trees inside the book, so they read one module-level store; the
 * event playback also lives here so it survives page re-renders.
 */

export interface BattleSetup {
  player: number;
  foe: number;
  level: number;
}

export type Phase = "loading" | "ready" | "intro" | "choose" | "playing" | "over" | "error";

interface ShownSide {
  hp: number;
  maxHp: number;
  status: Status;
}

export interface BattleView {
  key: string;
  phase: Phase;
  error: string | null;
  setup: BattleSetup;
  player: { mon: Mon; options: number[]; moves: number[] } | null;
  foe: { mon: Mon; moves: number[] } | null;
  state: BattleState | null;
  shown: Record<Side, ShownSide> | null;
  message: string;
  log: string[];
  flash: Side | null;
  lunge: Side | null;
  fainted: Side[];
  /** Which Pokémon are out on the field (for the send-out animation). */
  out: Record<Side, boolean>;
  result: "win" | "lose" | "run" | null;
}

const initialSetup: BattleSetup = { player: 25, foe: 0, level: 50 };

let view: BattleView = {
  key: "",
  phase: "loading",
  error: null,
  setup: initialSetup,
  player: null,
  foe: null,
  state: null,
  shown: null,
  message: "",
  log: [],
  flash: null,
  lunge: null,
  fainted: [],
  out: { player: false, foe: false },
  result: null,
};

const listeners = new Set<() => void>();
let generation = 0; // bumps on every reset so stale playback stops
let moveDict: MoveDict | null = null;
let chart: TypeData["chart"] | null = null;
let options: { sound: boolean; game: GameDef | null } = { sound: false, game: null };

function set(patch: Partial<BattleView>) {
  view = { ...view, ...patch };
  listeners.forEach((l) => l());
}

export function useBattle(): BattleView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
    () => view,
  );
}

const keyOf = (s: BattleSetup) => `${s.player}-${s.foe}-${s.level}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const pace = (ms: number) => (reducedMotion() ? Math.min(ms, 350) : ms);

function playCry(pid: number) {
  if (!options.sound) return;
  const urls = cryUrls(pid, options.game);
  const tryAt = (i: number) => {
    if (i >= urls.length) return;
    try {
      const a = new Audio(urls[i]);
      a.volume = 0.35;
      a.addEventListener("error", () => tryAt(i + 1), { once: true });
      void a.play().catch(() => undefined);
    } catch {
      /* no audio */
    }
  };
  tryAt(0);
}

async function loadMon(pid: number): Promise<{ mon: Mon; learnset: Learnset | null }> {
  const [index, forms] = await Promise.all([fetchResource("index", loadIndex), fetchResource("forms", loadForms)]);
  if (pid >= 1 && pid <= index.length) {
    const species = index[pid - 1];
    const detail = await fetchResource(`detail:${pid}`, () => loadDetail(pid));
    return { mon: speciesMon(species), learnset: detail.moves };
  }
  const form = forms.find((f) => f.pid === pid);
  if (!form) throw new Error(`Unknown Pokémon #${pid}`);
  const detail = await fetchResource(`detail:${form.species}`, () => loadDetail(form.species));
  const own = detail.forms?.find((f) => f.pid === pid)?.moves;
  return { mon: formMon(form), learnset: own ?? detail.moves };
}

/** Load both Pokémon for a setup (no-op if it's already loaded). */
export async function configure(setup: BattleSetup) {
  const key = keyOf(setup);
  if (key === view.key && view.phase !== "error") return;
  const gen = ++generation;
  set({
    key,
    phase: "loading",
    error: null,
    setup,
    state: null,
    shown: null,
    message: "",
    log: [],
    flash: null,
    lunge: null,
    fainted: [],
    out: { player: false, foe: false },
    result: null,
  });
  try {
    const [moves, types, p, f] = await Promise.all([
      fetchResource("moves", loadMoves),
      fetchResource("types", loadTypes),
      loadMon(setup.player),
      loadMon(setup.foe),
    ]);
    if (gen !== generation) return;
    moveDict = moves;
    chart = types.chart;
    const playerOptions = learnableMoves(p.learnset, setup.level).filter((id) => moves[id]);
    const keep = view.player && view.player.mon.pid === p.mon.pid ? view.player.moves.filter((id) => playerOptions.includes(id)) : [];
    set({
      phase: "ready",
      player: {
        mon: p.mon,
        options: playerOptions,
        moves: keep.length ? keep : defaultMoveset(playerOptions, moves, p.mon.types),
      },
      foe: { mon: f.mon, moves: defaultMoveset(learnableMoves(f.learnset, setup.level), moves, f.mon.types) },
      message: `${p.mon.name} vs ${f.mon.name}`,
    });
  } catch (err) {
    if (gen !== generation) return;
    set({ phase: "error", error: (err as Error).message });
  }
}

export function setPlayerMoves(ids: number[]) {
  if (!view.player || (view.phase !== "ready" && view.phase !== "over")) return;
  set({ player: { ...view.player, moves: ids.slice(0, 4) } });
}

function shownFrom(state: BattleState): Record<Side, ShownSide> {
  return {
    player: { hp: state.player.hp, maxHp: state.player.stats.hp, status: state.player.status },
    foe: { hp: state.foe.hp, maxHp: state.foe.stats.hp, status: state.foe.status },
  };
}

async function say(text: string, gen: number, ms = 900) {
  if (gen !== generation) return;
  set({ message: text, log: [...view.log, text].slice(-60) });
  await sleep(pace(ms));
}

export async function start(opts: { sound: boolean; game: GameDef | null }) {
  if (!view.player || !view.foe || !moveDict || !view.player.moves.length) return;
  options = opts;
  const gen = ++generation;
  const { level } = view.setup;
  const p = makeBattler(view.player.mon, view.player.moves, moveDict, level);
  const f = makeBattler(view.foe.mon, view.foe.moves.length ? view.foe.moves : [33], moveDict, level);
  const state = newBattle(p, f);
  set({
    phase: "intro",
    state,
    shown: shownFrom(state),
    log: [],
    fainted: [],
    out: { player: false, foe: false },
    result: null,
    flash: null,
    lunge: null,
  });
  set({ out: { player: false, foe: true } });
  playCry(f.pid);
  await say(`A wild ${f.name.toUpperCase()} appeared!`, gen, 1300);
  if (gen !== generation) return;
  set({ out: { player: true, foe: true } });
  playCry(p.pid);
  await say(`Go! ${p.name.toUpperCase()}!`, gen, 1100);
  if (gen !== generation) return;
  set({ phase: "choose", message: `What will ${p.name.toUpperCase()} do?` });
}

async function animateHp(side: Side, to: number, gen: number) {
  if (!view.shown) return;
  const from = view.shown[side].hp;
  const steps = 10;
  if (to < from) set({ flash: side });
  for (let i = 1; i <= steps; i++) {
    if (gen !== generation || !view.shown) return;
    const hp = Math.round(from + ((to - from) * i) / steps);
    set({ shown: { ...view.shown, [side]: { ...view.shown[side], hp } } });
    await sleep(pace(45));
  }
  set({ flash: null });
}

async function play(events: BattleEvent[], gen: number) {
  for (const e of events) {
    if (gen !== generation) return;
    if (e.kind === "text") await say(e.text, gen, 850);
    else if (e.kind === "use") {
      set({ lunge: e.side });
      await sleep(pace(260));
      set({ lunge: null });
    } else if (e.kind === "hp") await animateHp(e.side, e.hp, gen);
    else if (e.kind === "status" && view.shown) set({ shown: { ...view.shown, [e.side]: { ...view.shown[e.side], status: e.status } } });
    else if (e.kind === "faint") {
      set({ fainted: [...view.fainted, e.side] });
      playCry(view.state?.[e.side].pid ?? 0);
      await sleep(pace(500));
    }
  }
}

export async function choose(moveIndex: number) {
  if (view.phase !== "choose" || !view.state || !chart) return;
  const gen = generation;
  const { state, events } = runTurn(view.state, moveIndex, chart);
  set({ phase: "playing" });
  await play(events, gen);
  if (gen !== generation) return;
  set({ state, shown: shownFrom(state) });
  if (state.winner) {
    const win = state.winner === "player";
    await say(win ? `You won against the wild ${state.foe.name.toUpperCase()}!` : `${state.player.name.toUpperCase()} can't battle! You blacked out…`, gen, 600);
    set({ phase: "over", result: win ? "win" : "lose" });
  } else {
    set({ phase: "choose", message: `What will ${state.player.name.toUpperCase()} do?` });
  }
}

export async function run() {
  if (view.phase !== "choose") return;
  const gen = generation;
  await say("Got away safely!", gen, 600);
  set({ phase: "over", result: "run" });
}

/** Back to the setup screen (keeps the chosen Pokémon and moves). */
export function backToSetup() {
  generation++;
  set({ phase: "ready", state: null, shown: null, log: [], fainted: [], out: { player: false, foe: false }, result: null, message: "" });
}
