import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useGames } from "../lib/data";
import { useSession } from "../lib/session";
import type { SpeciesSummary } from "../lib/types";
import { SearchBar } from "./SearchBar";

/** The red Pokédex device around the book (INSTRUCTIONS.md §2.1). */

interface ShellProps {
  children: ReactNode;
  index: SpeciesSummary[] | undefined;
  pageLabel: string;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onRandom: () => void;
  onHome: () => void;
  randomHint: string;
  themeStyle?: CSSProperties;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (/input|textarea|select/i.test(el.tagName) || el.isContentEditable);
}

export function DexShell({ children, index, pageLabel, onPrev, onNext, onRandom, onHome, randomHint, themeStyle }: ShellProps) {
  const { user, authReady, signIn, sound, setSound, authError, clearAuthError, gameId, setGameId } = useSession();
  const { data: games } = useGames();
  const handlers = useRef({ onPrev, onNext, onRandom });
  handlers.current = { onPrev, onNext, onRandom };

  // ←/→ flip pages, "r" opens a random page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (document.querySelector("[aria-modal='true']")) return;
      if (e.key === "ArrowLeft" && handlers.current.onPrev) handlers.current.onPrev();
      else if (e.key === "ArrowRight" && handlers.current.onNext) handlers.current.onNext();
      else if (e.key.toLowerCase() === "r") handlers.current.onRandom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Swipe left/right on touch screens.
  const swipe = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className={`dex${gameId ? ` dex--game dex--${gameId}` : ""}`} style={themeStyle}>
      <header className="dex__top">
        <div className="dex__lights" aria-hidden="true">
          <span className="lens" />
          <span className="led led--red" />
          <span className="led led--yellow" />
          <span className="led led--green" />
        </div>
        <Link to="/" className="dex__title" aria-label="Registered To Pokédex home">
          <span className="dex__title-sub">REGISTERED TO</span>
          <span className="dex__title-main">POKéDEX</span>
        </Link>
        <div className="dex__account">
          <label className="game-select" title="Show every sprite, cry and Pokédex entry from one game">
            <span>GAME</span>
            <select value={gameId ?? ""} onChange={(e) => setGameId(e.target.value || null)}>
              <option value="">Modern (all)</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((gen) => {
                const inGen = (games ?? []).filter((g) => g.gen === gen);
                return inGen.length ? (
                  <optgroup key={gen} label={`Generation ${gen}`}>
                    {inGen.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.year})
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
          <button
            type="button"
            className={`btn btn--small${sound ? " btn--on" : ""}`}
            aria-pressed={sound}
            onClick={() => setSound(!sound)}
            title="Play cries when a Pokémon comes out of its ball"
          >
            {sound ? "SOUND ON" : "SOUND OFF"}
          </button>
          {user ? (
            <Link to="/trainer" className="trainer-chip" title="Trainer card">
              {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>◉</span>}
              <span className="trainer-chip__name">{(user.displayName ?? "TRAINER").split(" ")[0].toUpperCase()}</span>
            </Link>
          ) : (
            <button type="button" className="btn btn--small btn--yellow" onClick={signIn} disabled={!authReady}>
              SIGN IN
            </button>
          )}
        </div>
        {authError && (
          <div className="dex__auth-error textbox" role="alert">
            <p>{authError}</p>
            <button type="button" className="btn btn--small" onClick={clearAuthError}>
              OK
            </button>
          </div>
        )}
      </header>

      <div className="dex__toolbar">
        <SearchBar index={index} />
        <div className="toolbar-buttons">
          <button type="button" className="btn btn--blue random-btn" onClick={onRandom} title={randomHint}>
            RANDOM
          </button>
          <Link to="/battle" className="btn btn--red random-btn" title="Battle simulator (beta)">
            BATTLE β
          </Link>
        </div>
      </div>

      <main
        className="dex__body"
        onPointerDown={(e) => {
          if (e.pointerType === "touch") swipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || e.pointerType !== "touch") return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dx) > 70 && Math.abs(dy) < 50) (dx < 0 ? onNext : onPrev)?.();
        }}
      >
        {children}
      </main>

      <footer className="dex__controls">
        <div className="dpad" role="group" aria-label="Page controls">
          <button type="button" className="dpad__btn dpad__btn--left" onClick={() => onPrev?.()} disabled={!onPrev} aria-label="Previous page">
            ◀
          </button>
          <span className="dpad__center" aria-hidden="true" />
          <button type="button" className="dpad__btn dpad__btn--right" onClick={() => onNext?.()} disabled={!onNext} aria-label="Next page">
            ▶
          </button>
        </div>
        <div className="page-lcd" aria-live="polite">
          {pageLabel}
        </div>
        <div className="ab-buttons">
          <button type="button" className="ab ab--b" onClick={onHome} aria-label="B: back to index">
            B
          </button>
          <button type="button" className="ab ab--a" onClick={onRandom} aria-label="A: random Pokémon">
            A
          </button>
          <span className="ab-buttons__legend" aria-hidden="true">
            B INDEX · A RANDOM
          </span>
        </div>
      </footer>
    </div>
  );
}
