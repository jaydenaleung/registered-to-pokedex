import { useCallback, useEffect, useMemo, useRef } from "react";
import { BrowserRouter, matchPath, useLocation, useNavigate } from "react-router-dom";
import { Book, type Spread } from "./components/Book";
import { DexShell } from "./components/DexShell";
import { dexNo, Loading } from "./components/basics";
import { useIndex, useTypes } from "./lib/data";
import { themeStyle } from "./lib/gameThemes";
import { applyQuery, isEmptyQuery, parseQuery } from "./lib/search";
import { SessionProvider, useGame, useSession } from "./lib/session";
import { inGame } from "./lib/sprites";
import { useVoteTotals } from "./lib/votes";
import { IndexSide, PER_PAGE, PER_SPREAD } from "./pages/IndexPage";
import { NotFoundLeft, NotFoundRight } from "./pages/NotFoundPage";
import { PokemonLeft, PokemonRight } from "./pages/PokemonPage";
import { TrainerLeft, TrainerRight } from "./pages/TrainerPage";
import { BattleLeft, BattleRight } from "./pages/BattlePage";

const MAX_ID = 1025;
export const SITE_NAME = "Registered To Pokédex";

function indexUrl(q: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("p", String(page));
  const s = params.toString();
  return s ? `/?${s}` : "/";
}

interface Resolved {
  spread: Spread;
  pageLabel: string;
  prev: string | null;
  next: string | null;
  title: string;
}

function DexApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: index, error: indexError } = useIndex();
  const { data: types } = useTypes();
  const { caught } = useSession();
  const game = useGame();
  const { totals, status: votesStatus } = useVoteTotals();
  const lastIndexUrl = useRef("/");

  const params = new URLSearchParams(location.search);
  const q = params.get("q") ?? "";
  const formParam = Number(params.get("form"));
  const formPid = Number.isInteger(formParam) && formParam > MAX_ID ? formParam : null;
  const parsed = useMemo(() => parseQuery(q), [q]);
  const caughtIds = useMemo(() => new Set(caught.keys()), [caught]);
  // In a game mode, the book only lists Pokémon that appear in that game.
  const dex = useMemo(() => (index && game ? index.filter((s) => inGame(game, s.id)) : index), [index, game]);
  const results = useMemo(
    () => (dex ? applyQuery(dex, parsed, { chart: types?.chart, votes: totals, caught: caughtIds }) : []),
    [dex, parsed, types, totals, caughtIds],
  );

  const onIndexRoute = location.pathname === "/";
  if (onIndexRoute) lastIndexUrl.current = `${location.pathname}${location.search}`;

  // Flipping from a Pokémon page walks the National Dex, or the selected game's dex.
  const neighbours = (id: number): { prev: string | null; next: string | null } => {
    if (game && dex) {
      const i = dex.findIndex((s) => s.id === id);
      const before = i > 0 ? dex[i - 1] : i < 0 ? [...dex].reverse().find((s) => s.id < id) : undefined;
      const after = i >= 0 ? dex[i + 1] : dex.find((s) => s.id > id);
      return { prev: before ? `/pokemon/${before.id}` : lastIndexUrl.current, next: after ? `/pokemon/${after.id}` : null };
    }
    return { prev: id > 1 ? `/pokemon/${id - 1}` : lastIndexUrl.current, next: id < MAX_ID ? `/pokemon/${id + 1}` : null };
  };

  const resolved: Resolved = useMemo(() => {
    const pokemonMatch = matchPath("/pokemon/:id", location.pathname);
    if (onIndexRoute) {
      const spreads = Math.max(1, Math.ceil(results.length / PER_SPREAD));
      const page = Math.min(spreads, Math.max(1, Number(params.get("p")) || 1));
      const start = (page - 1) * PER_SPREAD;
      const common = {
        spread: page,
        spreads,
        total: results.length,
        query: q,
        loading: !index && !indexError,
        error: indexError,
        caught: caughtIds,
        totals,
        votesOffline: votesStatus === "offline",
      };
      return {
        spread: {
          key: `index:${page}`,
          order: page,
          left: <IndexSide side="left" items={results.slice(start, start + PER_PAGE)} {...common} />,
          right: <IndexSide side="right" items={results.slice(start + PER_PAGE, start + PER_SPREAD)} {...common} />,
        },
        pageLabel: index ? `PAGE ${page}/${spreads}` : "LOADING",
        prev: page > 1 ? indexUrl(q, page - 1) : null,
        next: page < spreads ? indexUrl(q, page + 1) : index && results.length ? `/pokemon/${results[0].id}` : null,
        title: q ? `“${q}” · ${SITE_NAME}` : SITE_NAME,
      };
    }
    if (pokemonMatch) {
      const raw = pokemonMatch.params.id ?? "";
      const id = /^\d+$/.test(raw) ? Number(raw) : (index?.find((s) => s.slug === raw.toLowerCase())?.id ?? NaN);
      const species = index?.[id - 1];
      if (!index) {
        return {
          spread: {
            key: `pokemon:${raw}`,
            order: 100 + (Number(raw) || 0),
            left: (
              <div className="page-pad page-pad--center">
                <Loading />
              </div>
            ),
            right: null,
          },
          pageLabel: "LOADING",
          prev: null,
          next: null,
          title: SITE_NAME,
        };
      }
      if (species) {
        return {
          spread: {
            key: `pokemon:${species.id}`,
            order: 100 + species.id,
            left: <PokemonLeft species={species} formPid={formPid} />,
            right: <PokemonRight species={species} formPid={formPid} />,
          },
          pageLabel: `${dexNo(species.id)}`,
          ...neighbours(species.id),
          title: `${species.name} · ${dexNo(species.id)} · ${SITE_NAME}`,
        };
      }
    }
    if (location.pathname === "/battle") {
      const num = (k: string) => {
        const v = Number(params.get(k));
        return Number.isInteger(v) && v > 0 ? v : 0;
      };
      const level = Math.min(100, num("lv") || 50);
      return {
        spread: {
          key: "battle",
          order: 4000,
          left: <BattleLeft />,
          right: <BattleRight player={num("p") || 25} foe={num("o")} level={level} />,
        },
        pageLabel: "BATTLE β",
        prev: lastIndexUrl.current,
        next: null,
        title: `Battle (beta) · ${SITE_NAME}`,
      };
    }
    if (location.pathname === "/trainer") {
      return {
        spread: { key: "trainer", order: 5000, left: <TrainerLeft index={index} />, right: <TrainerRight /> },
        pageLabel: "TRAINER",
        prev: lastIndexUrl.current,
        next: null,
        title: `Trainer card · ${SITE_NAME}`,
      };
    }
    return {
      spread: { key: "missingno", order: 9000, left: <NotFoundLeft />, right: <NotFoundRight /> },
      pageLabel: "No.???",
      prev: "/",
      next: null,
      title: `MissingNo. · ${SITE_NAME}`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, results, index, dex, indexError, caughtIds, totals, votesStatus]);

  useEffect(() => {
    document.title = resolved.title;
  }, [resolved.title]);

  // Redirect slugs (/pokemon/pikachu) to the canonical numeric URL.
  useEffect(() => {
    const m = matchPath("/pokemon/:id", location.pathname);
    if (m && index && !/^\d+$/.test(m.params.id ?? "")) {
      const found = index.find((s) => s.slug === (m.params.id ?? "").toLowerCase());
      if (found) navigate(`/pokemon/${found.id}`, { replace: true });
    }
  }, [location.pathname, index, navigate]);

  const randomPool = onIndexRoute && !isEmptyQuery(parsed) && results.length ? results : null;
  const onRandom = useCallback(() => {
    const current = matchPath("/pokemon/:id", location.pathname)?.params.id;
    const pool = randomPool ?? dex;
    if (!pool?.length) return;
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && String(pick.id) === current) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    navigate(`/pokemon/${pick.id}`);
  }, [randomPool, dex, location.pathname, navigate]);

  const { prev, next } = resolved;
  return (
    <DexShell
      index={dex}
      themeStyle={themeStyle(game?.id ?? null)}
      pageLabel={resolved.pageLabel}
      onPrev={prev ? () => navigate(prev) : null}
      onNext={next ? () => navigate(next) : null}
      onRandom={onRandom}
      onHome={() => navigate(onIndexRoute ? "/" : lastIndexUrl.current)}
      randomHint={randomPool ? `Random from these ${randomPool.length} results (r)` : "Random Pokémon (r)"}
    >
      <Book spread={resolved.spread} />
    </DexShell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <DexApp />
      </SessionProvider>
    </BrowserRouter>
  );
}
