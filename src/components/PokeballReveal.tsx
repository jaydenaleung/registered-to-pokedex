import { useEffect, useState } from "react";
import { useSession } from "../lib/session";
import { animatedSprite, cryUrl, staticSprites } from "../lib/sprites";
import type { SpeciesSummary } from "../lib/types";
import { Img, PixelBall, useGhost } from "./basics";

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

export function playCry(id: number) {
  try {
    const audio = new Audio(cryUrl(id));
    audio.volume = 0.35;
    void audio.play().catch(() => undefined);
  } catch {
    /* audio unsupported */
  }
}

export function PokeballReveal({ species, playKey }: { species: SpeciesSummary; playKey: number }) {
  const ghost = useGhost();
  const { sound } = useSession();
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
      if (sound) playCry(species.id);
    }, OPEN_AT);
    const done = setTimeout(() => setPhase("done"), DONE_AT);
    return () => {
      clearTimeout(open);
      clearTimeout(done);
    };
    // `sound` is read at throw time on purpose; toggling it shouldn't re-throw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species.id, playKey, skip]);

  const anim = animatedSprite(species);
  const sprites = staticSprites(species.id);
  const sources = phase === "done" && anim ? [anim, ...sprites] : sprites;

  return (
    <div className={`arena arena--${phase}`} aria-label={`${species.name} battle arena`}>
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
        <Img
          className={`mon__sprite mon__sprite--${anim && phase === "done" ? species.anim : "bw"}`}
          sources={sources}
          alt={species.name}
          fallback={<span className="mon__missing">?</span>}
        />
      </div>
    </div>
  );
}
