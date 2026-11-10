import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loading, SpriteImg, TypeBadge, useGhost } from "../components/basics";
import { isLocked, isSimulated, toBattleMove, type Side, type Status } from "../lib/battle";
import { backToSetup, choose, configure, run, setPlayerMoves, start, useBattle } from "../lib/battleStore";
import { useForms, useIndex, useMoves } from "../lib/data";
import { normalize } from "../lib/search";
import { useGame, useSession } from "../lib/session";
import { arenaSprites, gameBackSprites, inGame, tileSprites } from "../lib/sprites";
import { TYPE_COLORS } from "../lib/typeChart";
import type { Mon } from "../lib/types";

/** Battle simulator (beta) — INSTRUCTIONS.md §12. */

const STATUS_LABEL: Record<Exclude<Status, null>, string> = { par: "PAR", brn: "BRN", psn: "PSN", slp: "SLP", frz: "FRZ" };

function HpBox({ side, name, level, hp, maxHp, status }: { side: Side; name: string; level: number; hp: number; maxHp: number; status: Status }) {
  const pct = maxHp ? (hp / maxHp) * 100 : 0;
  const tone = pct > 50 ? "good" : pct > 20 ? "warn" : "low";
  return (
    <div className={`hpbox hpbox--${side}`}>
      <div className="hpbox__top">
        <strong>{name.toUpperCase()}</strong>
        <span>
          {status && <em className={`status status--${status}`}>{STATUS_LABEL[status]}</em>} Lv{level}
        </span>
      </div>
      <div className="hpbox__bar">
        <span className="hpbox__hp">HP</span>
        <span className="hpbox__track" role="meter" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp} aria-label={`${name} HP`}>
          <span className={`hpbox__fill hpbox__fill--${tone}`} style={{ width: `${pct}%` }} />
        </span>
      </div>
      {side === "player" && (
        <div className="hpbox__nums">
          {hp}/ {maxHp}
        </div>
      )}
    </div>
  );
}

function FieldMon({ mon, side, visible, flash, lunge, fainted }: { mon: Mon; side: Side; visible: boolean; flash: boolean; lunge: boolean; fainted: boolean }) {
  const game = useGame();
  const sprite = side === "foe" ? arenaSprites(mon, game) : null;
  const back = side === "player" ? gameBackSprites(mon, game) : null;
  const classes = ["field-mon", `field-mon--${side}`, visible ? "is-out" : "", flash ? "is-hit" : "", lunge ? "is-lunge" : "", fainted ? "is-fainted" : ""].join(" ");
  return (
    <div className={classes}>
      <span className="field-mon__platform" aria-hidden="true" />
      {sprite ? (
        <SpriteImg set={sprite} active className="field-mon__sprite" alt={mon.name} eager />
      ) : (
        <SpriteImg
          set={{ still: back!.sources, active: null, fit: back!.fit, missing: false, smooth: back!.smooth }}
          className="field-mon__sprite"
          alt={`${mon.name} (back)`}
          eager
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ left page: the field

export function BattleLeft() {
  const b = useBattle();
  const ghost = useGhost();
  if (b.phase === "loading" || !b.player || !b.foe) {
    return (
      <div className="page-pad page-pad--center">
        {b.phase === "error" ? <p className="body-text">Couldn't set up the battle: {b.error}</p> : <Loading label="PREPARING BATTLE" />}
      </div>
    );
  }
  const live = !!b.state && b.phase !== "ready";
  const level = b.setup.level;
  const shown = b.shown;
  return (
    <div className="battle">
      <header className="title-strip">
        <span className="title-strip__no">BETA</span>
        <h1 className="title-strip__name">BATTLE</h1>
        <span className="title-strip__genus">
          {b.player.mon.name} vs {b.foe.mon.name} · Lv{level}
        </span>
      </header>
      <div className={`battle-field${live ? " is-live" : ""}`}>
        {(!live || b.out.foe) && (
          <HpBox side="foe" name={b.foe.mon.name} level={level} hp={shown?.foe.hp ?? 1} maxHp={shown?.foe.maxHp ?? 1} status={shown?.foe.status ?? null} />
        )}
        <FieldMon
          mon={b.foe.mon}
          side="foe"
          visible={!live || b.out.foe}
          flash={b.flash === "foe"}
          lunge={b.lunge === "foe"}
          fainted={b.fainted.includes("foe")}
        />
        <FieldMon
          mon={b.player.mon}
          side="player"
          visible={!live || b.out.player}
          flash={b.flash === "player"}
          lunge={b.lunge === "player"}
          fainted={b.fainted.includes("player")}
        />
        {(!live || b.out.player) && (
          <HpBox
            side="player"
            name={b.player.mon.name}
            level={level}
            hp={shown?.player.hp ?? 1}
            maxHp={shown?.player.maxHp ?? 1}
            status={shown?.player.status ?? null}
          />
        )}
        {!live && <span className="battle-field__vs">VS</span>}
      </div>
      <div className="battle-text textbox" aria-live={ghost ? undefined : "polite"}>
        {b.message || "Choose your Pokémon and an opponent, then START."}
        {b.phase === "choose" && <span className="blink"> ▼</span>}
      </div>
      <p className="body-text dim small battle-note">
        Beta: Gen V+ damage, types, crits, accuracy, priority, status, stat stages, multi-hit, drain, charge and recharge turns. No abilities, items, weather or switching yet.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ right page: menus

interface Choice {
  pid: number;
  name: string;
  species: number;
}

function MonPicker({ label, value, onPick, onRandom }: { label: string; value: Mon | undefined; onPick: (pid: number) => void; onRandom?: () => void }) {
  const { data: index } = useIndex();
  const { data: forms } = useForms();
  const game = useGame();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const choices = useMemo<Choice[]>(() => {
    const all: Choice[] = [
      ...(index ?? []).map((s) => ({ pid: s.id, name: s.name, species: s.id })),
      ...(forms ?? []).map((f) => ({ pid: f.pid, name: f.name, species: f.species })),
    ];
    return game ? all.filter((c) => inGame(game, c.pid) || inGame(game, c.species)) : all;
  }, [index, forms, game]);
  const n = normalize(text);
  const matches = n ? choices.filter((c) => normalize(c.name).includes(n) || String(c.species) === text.replace("#", "")).slice(0, 8) : [];

  return (
    <div className="picker">
      <span className="picker__label">{label}</span>
      <div className="picker__current">
        {value && <SpriteImg set={tileSprites(value, game)} size={48} />}
        <strong>{value?.name ?? "…"}</strong>
        {onRandom && (
          <button type="button" className="btn btn--small" onClick={onRandom}>
            RANDOM
          </button>
        )}
      </div>
      <div className="picker__search">
        <input
          value={text}
          placeholder="Change: name or #"
          aria-label={`${label}: search`}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) {
              onPick(matches[0].pid);
              setText("");
              setOpen(false);
            }
          }}
        />
        {open && matches.length > 0 && (
          <ul className="picker__list textbox" role="listbox">
            {matches.map((c) => (
              <li key={c.pid}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(c.pid);
                    setText("");
                    setOpen(false);
                  }}
                >
                  #{String(c.species).padStart(3, "0")} {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MoveChooser() {
  const b = useBattle();
  const { data: moves } = useMoves();
  if (!b.player || !moves) return null;
  const selected = b.player.moves;
  const list = b.player.options
    .map((id) => toBattleMove(id, moves))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .sort((a, c) => Number(selected.includes(c.id)) - Number(selected.includes(a.id)) || (c.power ?? 0) - (a.power ?? 0) || a.name.localeCompare(c.name));
  const toggle = (id: number) => {
    if (selected.includes(id)) setPlayerMoves(selected.filter((x) => x !== id));
    else if (selected.length < 4) setPlayerMoves([...selected, id]);
  };
  return (
    <div className="move-chooser">
      <h3 className="section-title">
        MOVES ({selected.length}/4) <small>· from its level-{b.setup.level} learnset</small>
      </h3>
      <ul className="move-chooser__list">
        {list.map((m) => {
          const on = selected.includes(m.id);
          const simulated = isSimulated(m);
          return (
            <li key={m.id}>
              <label className={`move-option${on ? " is-on" : ""}${simulated ? "" : " is-unsupported"}`}>
                <input type="checkbox" checked={on} disabled={!on && selected.length >= 4} onChange={() => toggle(m.id)} />
                <TypeBadge type={m.type} small />
                <span className="move-option__name">{m.name}</span>
                <span className="move-option__stats">
                  {m.category === "status" ? "STATUS" : `${m.power ?? "—"} PWR`} · {m.accuracy ?? "—"}%
                </span>
                {!simulated && <em className="move-option__note">no effect (beta)</em>}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BattleRight({ player, foe, level }: { player: number; foe: number; level: number }) {
  const b = useBattle();
  const ghost = useGhost();
  const navigate = useNavigate();
  const game = useGame();
  const { sound } = useSession();
  const { data: index } = useIndex();

  const randomFoe = () => {
    const pool = (index ?? []).filter((s) => !game || inGame(game, s.id));
    if (!pool.length) return 6;
    return pool[Math.floor(Math.random() * pool.length)].id;
  };
  const go = (next: { player?: number; foe?: number; level?: number }) => {
    const p = next.player ?? player;
    const o = next.foe ?? foe;
    const lv = next.level ?? level;
    navigate(`/battle?p=${p}&o=${o}&lv=${lv}`, { replace: true });
  };

  // Pick a random opponent when the URL doesn't name one.
  useEffect(() => {
    if (ghost || foe || !index) return;
    go({ foe: randomFoe() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost, foe, index]);

  useEffect(() => {
    if (ghost || !foe) return;
    void configure({ player, foe, level });
  }, [ghost, player, foe, level]);

  if (b.phase === "loading" || b.phase === "error" || !b.player || !b.foe) {
    return (
      <div className="page-pad page-pad--center">
        {b.phase === "error" ? (
          <>
            <p className="body-text">{b.error}</p>
            <Link className="btn btn--blue" to="/battle">
              NEW BATTLE
            </Link>
          </>
        ) : (
          <Loading />
        )}
      </div>
    );
  }

  const inBattle = b.phase === "intro" || b.phase === "choose" || b.phase === "playing";
  if (inBattle && b.state) {
    const me = b.state.player;
    return (
      <div className="battle-menu">
        <h2 className="page-title">FIGHT</h2>
        {isLocked(me) && (
          <button type="button" className="btn btn--red battle-start" disabled={b.phase !== "choose" || ghost} onClick={() => void choose(0)}>
            {me.recharge ? "RECHARGE" : `CONTINUE ${me.charging?.name.toUpperCase()}`} ▶
          </button>
        )}
        <div className="fight-grid" hidden={isLocked(me)}>
          {me.moves.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className="fight-move"
              style={{ ["--type" as string]: TYPE_COLORS[m.type] ?? "#888" }}
              disabled={b.phase !== "choose" || ghost}
              onClick={() => void choose(i)}
            >
              <span className="fight-move__name">{m.name}</span>
              <span className="fight-move__meta">
                <TypeBadge type={m.type} small /> PP {m.pp}/{m.maxPp}
              </span>
            </button>
          ))}
        </div>
        <div className="battle-menu__actions">
          <button type="button" className="btn btn--small" onClick={() => void run()} disabled={b.phase !== "choose" || ghost}>
            RUN
          </button>
          <span className="body-text dim small">Turn {b.state.turn}</span>
        </div>
        <h3 className="section-title">BATTLE LOG</h3>
        <ol className="battle-log" reversed>
          {[...b.log].reverse().map((line, i) => (
            <li key={b.log.length - i}>{line}</li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="battle-setup">
      {b.phase === "over" && (
        <div className={`battle-result battle-result--${b.result}`}>
          <strong>{b.result === "win" ? "YOU WIN!" : b.result === "lose" ? "YOU LOST…" : "GOT AWAY SAFELY"}</strong>
          <div>
            <button type="button" className="btn btn--red" onClick={() => void start({ sound, game })}>
              REMATCH
            </button>
            <button type="button" className="btn btn--small" onClick={() => go({ foe: randomFoe() })}>
              NEW OPPONENT
            </button>
            <button type="button" className="btn btn--small" onClick={backToSetup}>
              CHANGE MOVES
            </button>
          </div>
        </div>
      )}
      <MonPicker label="YOUR POKéMON" value={b.player.mon} onPick={(pid) => go({ player: pid })} />
      <MonPicker label="OPPONENT" value={b.foe.mon} onPick={(pid) => go({ foe: pid })} onRandom={() => go({ foe: randomFoe() })} />
      <label className="level-input">
        <span>LEVEL</span>
        <input
          type="number"
          min={1}
          max={100}
          value={level}
          onChange={(e) => {
            const lv = Math.max(1, Math.min(100, Number(e.target.value) || 50));
            go({ level: lv });
          }}
        />
      </label>
      {b.phase === "ready" && (
        <>
          <MoveChooser />
          <button type="button" className="btn btn--red battle-start" disabled={!b.player.moves.length || ghost} onClick={() => void start({ sound, game })}>
            START BATTLE
          </button>
        </>
      )}
    </div>
  );
}
