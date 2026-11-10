import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { catchTier } from "../lib/catchRate";
import { score } from "../lib/search";
import { useGame } from "../lib/session";
import { speciesMon, tileSprites } from "../lib/sprites";
import type { SpeciesSummary, VoteTally } from "../lib/types";
import { dexNo, SpriteImg, TypeBadge, TypePip, useGhost } from "./basics";
import { StatBars } from "./StatBars";

const QUICK_LOOK_DELAY = 600;

interface TileProps {
  species: SpeciesSummary;
  caught: boolean;
  tally?: VoteTally;
}

/** Index tile: static pixel sprite that animates on hover, plus a delayed quick look. */
export function PokemonTile({ species, caught, tally }: TileProps) {
  const ghost = useGhost();
  const [active, setActive] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLAnchorElement>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    if (ghost) return;
    setActive(true);
    clear();
    timer.current = setTimeout(() => {
      if (ref.current) setAnchor(ref.current.getBoundingClientRect());
    }, QUICK_LOOK_DELAY);
  };
  const stop = () => {
    clear();
    setActive(false);
    setAnchor(null);
  };

  useEffect(() => clear, []);
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  const game = useGame();
  const sprite = tileSprites(speciesMon(species), game);
  const onEnter = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || e.pointerType === "pen") start();
  };

  return (
    <>
      <Link
        ref={ref}
        to={`/pokemon/${species.id}`}
        className={`tile${active ? " tile--active" : ""}${caught ? " tile--caught" : ""}`}
        onPointerEnter={onEnter}
        onPointerLeave={stop}
        onFocus={start}
        onBlur={stop}
        onClick={stop}
        aria-label={`${dexNo(species.id)} ${species.name}`}
      >
        <span className="tile__no">{dexNo(species.id)}</span>
        {caught && (
          <span className="tile__caught" title="Caught">
            ✓
          </span>
        )}
        <span className="tile__sprite">
          <SpriteImg set={sprite} active={active} size={96} />
        </span>
        <span className="tile__name">{species.name}</span>
        <span className="tile__types">
          {species.types.map((t) => (
            <TypePip key={t} type={t} />
          ))}
        </span>
      </Link>
      {anchor && createPortal(<QuickLook species={species} anchor={anchor} caught={caught} tally={tally} />, document.body)}
    </>
  );
}

function QuickLook({ species, anchor, caught, tally }: TileProps & { anchor: DOMRect }) {
  const width = 280;
  const gap = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const placeRight = anchor.right + gap + width <= vw - 8;
  const left = placeRight ? anchor.right + gap : Math.max(8, anchor.left - gap - width);
  const top = Math.min(Math.max(8, anchor.top - 8), Math.max(8, vh - 330));
  const tier = catchTier(species.capture);
  const flag = species.mythical ? "MYTHICAL" : species.legendary ? "LEGENDARY" : species.baby ? "BABY" : null;

  return (
    <div className="quicklook textbox" role="tooltip" style={{ left, top, width }}>
      <div className="quicklook__head">
        <span className="quicklook__no">{dexNo(species.id)}</span>
        <strong>{species.name.toUpperCase()}</strong>
      </div>
      <div className="quicklook__genus">{species.genus}</div>
      <div className="quicklook__types">
        {species.types.map((t) => (
          <TypeBadge key={t} type={t} small />
        ))}
        {flag && <span className="flag-chip">{flag}</span>}
      </div>
      {species.forms && <div className="quicklook__forms">FORMS: {species.forms.map(formTagLabel).join(" · ")}</div>}
      <StatBars stats={species.stats} compact />
      <div className="quicklook__foot">
        <span>
          CATCH <b>{tier.label.toUpperCase()}</b>
        </span>
        <span>
          SCORE <b>{tally ? (score(tally) > 0 ? `+${score(tally)}` : score(tally)) : "0"}</b>
        </span>
        {caught && <span className="quicklook__caught">✓ CAUGHT</span>}
      </div>
    </div>
  );
}

const FORM_TAG_LABELS: Record<string, string> = {
  alola: "Alolan",
  galar: "Galarian",
  hisui: "Hisuian",
  paldea: "Paldean",
  mega: "Mega",
  primal: "Primal",
  gmax: "Gigantamax",
  other: "Other",
};

export const formTagLabel = (tag: string) => FORM_TAG_LABELS[tag] ?? tag;
