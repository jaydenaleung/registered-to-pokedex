import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GhostContext } from "./basics";

/**
 * Two-page book with a real page turn (INSTRUCTIONS.md §2.2).
 *
 * Turning forward, the old right page lifts off the spine, rotates over and lands
 * on the left showing the new left page on its back. Pages shown on the moving
 * sheet are static "ghost" copies (no animations or effects). Phones get a slide.
 */

export interface Spread {
  /** Changing the key turns the page. */
  key: string;
  /** Larger order = later in the book; decides the turn direction. */
  order: number;
  left: ReactNode;
  right: ReactNode;
}

type Dir = "next" | "prev";

interface FlipState {
  from: Spread;
  dir: Dir;
  id: number;
}

const FLIP_MS = 720;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function isNarrow() {
  return typeof window !== "undefined" && window.matchMedia?.("(max-width: 819px)").matches;
}

function Ghost({ children }: { children: ReactNode }) {
  return (
    <GhostContext.Provider value={true}>
      <div className="page__inner" aria-hidden="true" inert>
        {children}
      </div>
    </GhostContext.Provider>
  );
}

function Live({ children }: { children: ReactNode }) {
  return <div className="page__inner">{children}</div>;
}

export function Book({ spread }: { spread: Spread }) {
  const [shown, setShown] = useState(spread);
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [slide, setSlide] = useState<{ dir: Dir; id: number } | null>(null);
  const counter = useRef(0);
  const bookRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (spread.key === shown.key) {
      // Same page, new content (e.g. live search results): update in place.
      if (spread !== shown) setShown(spread);
      return;
    }
    const dir: Dir = spread.order >= shown.order ? "next" : "prev";
    const id = ++counter.current;
    if (prefersReducedMotion()) {
      setFlip(null);
      setSlide(null);
    } else if (isNarrow()) {
      setSlide({ dir, id });
    } else {
      setFlip({ from: shown, dir, id });
    }
    setShown(spread);
    // Keep the book in view when turning from far down the page.
    const top = bookRef.current?.getBoundingClientRect().top ?? 0;
    if (top < -40) bookRef.current?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [spread, shown]);

  useEffect(() => {
    if (!flip) return;
    const t = setTimeout(() => setFlip((f) => (f?.id === flip.id ? null : f)), FLIP_MS);
    return () => clearTimeout(t);
  }, [flip]);

  useEffect(() => {
    if (!slide) return;
    const t = setTimeout(() => setSlide((s) => (s?.id === slide.id ? null : s)), 400);
    return () => clearTimeout(t);
  }, [slide]);

  const current = shown;
  let left: ReactNode;
  let right: ReactNode;
  let sheet: ReactNode = null;

  if (flip?.dir === "next") {
    left = <Ghost key={`g-${flip.from.key}-L`}>{flip.from.left}</Ghost>;
    right = <Live key={`l-${current.key}-R`}>{current.right}</Live>;
    sheet = (
      <div className="sheet sheet--next" key={`sheet-${flip.id}`}>
        <div className="sheet__face sheet__face--front page page--right">
          <Ghost>{flip.from.right}</Ghost>
        </div>
        <div className="sheet__face sheet__face--back page page--left">
          <Ghost>{current.left}</Ghost>
        </div>
      </div>
    );
  } else if (flip?.dir === "prev") {
    left = <Live key={`l-${current.key}-L`}>{current.left}</Live>;
    right = <Ghost key={`g-${flip.from.key}-R`}>{flip.from.right}</Ghost>;
    sheet = (
      <div className="sheet sheet--prev" key={`sheet-${flip.id}`}>
        <div className="sheet__face sheet__face--front page page--left">
          <Ghost>{flip.from.left}</Ghost>
        </div>
        <div className="sheet__face sheet__face--back page page--right">
          <Ghost>{current.right}</Ghost>
        </div>
      </div>
    );
  } else {
    left = <Live key={`l-${current.key}-L`}>{current.left}</Live>;
    right = <Live key={`l-${current.key}-R`}>{current.right}</Live>;
  }

  return (
    <div
      ref={bookRef}
      className={`book${flip ? " book--flipping" : ""}${slide ? ` book--slide-${slide.dir}` : ""}`}
    >
      <section className="page page--left" aria-label="Left page">
        {left}
      </section>
      <div className="book__spine" aria-hidden="true" />
      <section className="page page--right" aria-label="Right page">
        {right}
      </section>
      {sheet}
    </div>
  );
}
