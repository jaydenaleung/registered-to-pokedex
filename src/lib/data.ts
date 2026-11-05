import { useEffect, useReducer } from "react";
import type { MoveDict, SpeciesDetail, SpeciesSummary, TypeData } from "./types";

/**
 * Tiny resource cache for the static JSON in /data. Values that are already loaded
 * are returned synchronously, so "ghost" pages rendered during a page flip never
 * flash a loading state.
 */

type Entry<T> = { status: "pending"; promise: Promise<T> } | { status: "ok"; value: T } | { status: "error"; error: Error };

const cache = new Map<string, Entry<unknown>>();

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function load<T>(key: string, loader: () => Promise<T>): Entry<T> {
  const existing = cache.get(key) as Entry<T> | undefined;
  if (existing && existing.status !== "error") return existing;
  const promise = loader().then(
    (value) => {
      cache.set(key, { status: "ok", value });
      return value;
    },
    (error: Error) => {
      cache.set(key, { status: "error", error });
      throw error;
    },
  );
  const entry: Entry<T> = { status: "pending", promise };
  cache.set(key, entry);
  promise.catch(() => undefined);
  return entry;
}

export interface Resource<T> {
  data: T | undefined;
  error: Error | undefined;
}

export function useResource<T>(key: string | null, loader: () => Promise<T>): Resource<T> {
  // The cache is the source of truth; local state only forces a re-render once loaded.
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const entry = load(key, loader);
    if (entry.status === "pending") entry.promise.then(() => alive && rerender(), () => alive && rerender());
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { data: undefined, error: undefined };
  const e = cache.get(key) as Entry<T> | undefined;
  if (e?.status === "ok") return { data: e.value, error: undefined };
  if (e?.status === "error") return { data: undefined, error: e.error };
  return { data: undefined, error: undefined };
}

const BASE = `${import.meta.env.BASE_URL}data`;

export const loadIndex = () => fetchJson<SpeciesSummary[]>(`${BASE}/index.json`);
export const loadTypes = () => fetchJson<TypeData>(`${BASE}/types.json`);
export const loadMoves = () => fetchJson<MoveDict>(`${BASE}/moves.json`);
export const loadDetail = (id: number) => fetchJson<SpeciesDetail>(`${BASE}/pokemon/${id}.json`);

export const useIndex = () => useResource("index", loadIndex);
export const useTypes = () => useResource("types", loadTypes);
export const useMoves = () => useResource("moves", loadMoves);
export const useDetail = (id: number | null) =>
  useResource(id ? `detail:${id}` : null, () => loadDetail(id as number));

/** Warm the cache (e.g. neighbouring pages) without rendering anything. */
export function prefetchDetail(id: number) {
  if (id >= 1 && id <= 1025) load(`detail:${id}`, () => loadDetail(id));
}

export function prefetchCore() {
  load("index", loadIndex);
  load("types", loadTypes);
}
