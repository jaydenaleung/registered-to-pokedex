import { Link } from "react-router-dom";
import { PokemonTile } from "../components/PokemonTile";
import { Loading, PixelBall } from "../components/basics";
import type { SpeciesSummary, VoteTally } from "../lib/types";

export const PER_PAGE = 12;
export const PER_SPREAD = PER_PAGE * 2;

interface IndexSideProps {
  side: "left" | "right";
  items: SpeciesSummary[];
  /** 1-based spread number */
  spread: number;
  spreads: number;
  total: number;
  query: string;
  loading: boolean;
  error?: Error;
  caught: Set<number>;
  totals: Map<number, VoteTally>;
  votesOffline: boolean;
}

/** One page of the index "book": a 3×4 grid of sprite tiles. */
export function IndexSide({ side, items, spread, spreads, total, query, loading, error, caught, totals, votesOffline }: IndexSideProps) {
  if (error) {
    return (
      <div className="page-pad">
        <h2 className="page-title">ERROR</h2>
        <p className="body-text">Couldn't load the Pokédex data ({error.message}). Check your connection and reload.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="page-pad page-pad--center">
        <Loading label="BOOTING POKéDEX" />
      </div>
    );
  }

  const pageNumber = (spread - 1) * 2 + (side === "left" ? 1 : 2);
  const offset = (spread - 1) * PER_SPREAD + (side === "left" ? 0 : PER_PAGE);

  if (total === 0) {
    return side === "left" ? (
      <div className="page-pad page-pad--center empty">
        <PixelBall className="empty__ball" />
        <h2 className="page-title">NO MATCH</h2>
        <p className="body-text">
          No Pokémon matched <q>{query}</q>. A wild MISSINGNO. might be hiding in the tall grass…
        </p>
      </div>
    ) : (
      <div className="page-pad page-pad--center">
        <p className="body-text">Try a name, a number like “#25”, a type like “fire”, or a region like “johto”.</p>
        <Link className="btn btn--blue" to="/">
          CLEAR SEARCH
        </Link>
      </div>
    );
  }

  return (
    <div className="index-page">
      <header className="index-page__head">
        {side === "left" ? (
          <>
            <span>{query ? "RESULTS" : "NATIONAL INDEX"}</span>
            <span>
              {offset + 1}–{Math.min(total, offset + PER_SPREAD)} / {total}
            </span>
          </>
        ) : (
          <>
            <span>HOVER FOR QUICK LOOK</span>
            <span>
              SPREAD {spread}/{spreads}
            </span>
          </>
        )}
      </header>
      {items.length ? (
        <div className="tile-grid">
          {items.map((s) => (
            <PokemonTile key={s.id} species={s} caught={caught.has(s.id)} tally={totals.get(s.id)} />
          ))}
        </div>
      ) : (
        <div className="page-pad page-pad--center">
          <p className="body-text dim">— end of results —</p>
        </div>
      )}
      <footer className="index-page__foot">
        PAGE {pageNumber}
        {side === "right" && votesOffline && <span className="index-page__note"> · VOTES OFFLINE</span>}
      </footer>
    </div>
  );
}
