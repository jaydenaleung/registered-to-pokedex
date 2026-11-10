import { useEffect, useState } from "react";
import { useGame, useSession } from "../lib/session";
import { arenaSprites, cryUrls } from "../lib/sprites";
import type { GameDef, Mon } from "../lib/types";
import { PixelBall, SpriteImg, useGhost } from "./basics";

/**
 * Pokéball throw (INSTRUCTIONS.md §2.5): arc in → bounce → wobble → pop open with a
 * flash and sparkles → the Pokémon grows out as a white silhouette, then colours in
 * and its animated sprite takes over.
 */

type Phase = "throw" | "open" | "done";

const OPEN_AT = 1350;
const DONE_AT = 2150;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Plays a cry, trying the selected game's cry first and falling back to the current one. */
export function playCry(pid: number, game: GameDef | null = null) {
  const urls = cryUrls(pid, game);
  const tryAt = (i: number) => {
    if (i >= urls.length) return;
    try {
      const audio = new Audio(urls[i]);
      audio.volume = 0.35;
      audio.addEventListener("error", () => tryAt(i + 1), { once: true });
      void audio.play().catch(() => undefined);
    } catch {
      /* audio unsupported */
    }
  };
  tryAt(0);
}

export function PokeballReveal({ mon, playKey }: { mon: Mon; playKey: number }) {
  const ghost = useGhost();
  const { sound } = useSession();
  const game = useGame();
  const skip = ghost || reducedMotion();
  const [phase, setPhase] = useState<Phase>(skip ? "done" : "throw");

  useEffect(() => {
    if (skip) {
      setPhase("done");
      return;
    }
    setPhase("throw");
    const open = setTimeout(() => {
      setPhase("open");
      if (sound) playCry(mon.pid, game);
    }, OPEN_AT);
    const done = setTimeout(() => setPhase("done"), DONE_AT);
    return () => {
      clearTimeout(open);
      clearTimeout(done);
    };
    // `sound`/`game` are read at throw time on purpose; toggling them shouldn't re-throw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mon.pid, playKey, skip]);

  const sprite = arenaSprites(mon, game);
  const variant = sprite.fit ? "fit" : phase === "done" && sprite.active ? (mon.anim ?? "bw") : "bw";

  return (
    <div className={`arena arena--${phase}`} aria-label={`${mon.name} battle arena`}>
      <div className="arena__sky" aria-hidden="true" />
      <div className="arena__platform" aria-hidden="true" />
      {phase !== "done" && (
        <div className="throw" key={`throw-${playKey}`} aria-hidden="true">
          <div className="throw__y">
            <div className={`ball${phase === "open" ? " ball--open" : ""}`}>
              <PixelBall part="top" className="ball__top" />
              <PixelBall part="bottom" className="ball__bottom" />
            </div>
          </div>
        </div>
      )}
      {phase === "open" && (
        <div className="burst" aria-hidden="true">
          <span className="burst__flash" />
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="burst__spark" style={{ ["--a" as string]: `${i * 45}deg` }} />
          ))}
        </div>
      )}
      <div className="mon">
        <SpriteImg
          set={sprite}
          active={phase === "done"}
          className={`mon__sprite mon__sprite--${variant}`}
          alt={mon.name}
          eager
        />
      </div>
      {game && sprite.missing && <span className="arena__note">NOT IN {game.name.toUpperCase()}</span>}
    </div>
  );
}
