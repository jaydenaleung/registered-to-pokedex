import { useCallback, useEffect, useMemo, useRef } from "react";
import { BrowserRouter, matchPath, useLocation, useNavigate } from "react-router-dom";
import { Book, type Spread } from "./components/Book";
import { DexShell } from "./components/DexShell";
import { dexNo, Loading } from "./components/basics";
import { useIndex, useTypes } from "./lib/data";
import { applyQuery, isEmptyQuery, parseQuery } from "./lib/search";
import { SessionProvider, useSession } from "./lib/session";
import { useVoteTotals } from "./lib/votes";
import { IndexSide, PER_PAGE, PER_SPREAD } from "./pages/IndexPage";
import { NotFoundLeft, NotFoundRight } from "./pages/NotFoundPage";
import { PokemonLeft, PokemonRight } from "./pages/PokemonPage";
import { TrainerLeft, TrainerRight } from "./pages/TrainerPage";

const MAX_ID = 1025;

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
  const { totals, status: votesStatus } = useVoteTotals();
  const lastIndexUrl = useRef("/");

  const params = new URLSearchParams(location.search);
  const q = params.get("q") ?? "";
  const parsed = useMemo(() => parseQuery(q), [q]);
  const caughtIds = useMemo(() => new Set(caught.keys()), [caught]);
  const results = useMemo(
    () => (index ? applyQuery(index, parsed, { chart: types?.chart, votes: totals, caught: caughtIds }) : []),
    [index, parsed, types, totals, caughtIds],
  );

  const onIndexRoute = location.pathname === "/";
  if (onIndexRoute) lastIndexUrl.current = `${location.pathname}${location.search}`;

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
        title: q ? `“${q}” · Pokédex` : "Pokédex",
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
          title: "Pokédex",
        };
      }
      if (species) {
        return {
          spread: {
            key: `pokemon:${species.id}`,
            order: 100 + species.id,
            left: <PokemonLeft species={species} />,
            right: <PokemonRight species={species} />,
          },
          pageLabel: `${dexNo(species.id)}`,
          prev: species.id > 1 ? `/pokemon/${species.id - 1}` : lastIndexUrl.current,
          next: species.id < MAX_ID ? `/pokemon/${species.id + 1}` : null,
          title: `${species.name} · ${dexNo(species.id)} · Pokédex`,
        };
      }
    }
    if (location.pathname === "/trainer") {
      return {
        spread: { key: "trainer", order: 5000, left: <TrainerLeft index={index} />, right: <TrainerRight /> },
        pageLabel: "TRAINER",
        prev: lastIndexUrl.current,
        next: null,
        title: "Trainer card · Pokédex",
      };
    }
    return {
      spread: { key: "missingno", order: 9000, left: <NotFoundLeft />, right: <NotFoundRight /> },
      pageLabel: "No.???",
      prev: "/",
      next: null,
      title: "MissingNo. · Pokédex",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, results, index, indexError, caughtIds, totals, votesStatus]);

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
    const pool = randomPool ?? index;
    if (!pool?.length) return;
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && String(pick.id) === current) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    navigate(`/pokemon/${pick.id}`);
  }, [randomPool, index, location.pathname, navigate]);

  const { prev, next } = resolved;
  return (
    <DexShell
      index={index}
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
