import { collection, doc, getDocs, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";
import type { VoteTally } from "./types";

/**
 * Votes (INSTRUCTIONS.md §7.2):
 *   pokemonVotes/{dexId}               { up, down }      public tally
 *   pokemonVotes/{dexId}/voters/{uid}  { value: ±1, at } the caller's own vote
 * Both docs change in one transaction; firestore.rules reject any tally change that
 * does not exactly match the caller's vote change.
 */

export type VoteValue = 1 | -1 | 0;

const tallyRef = (dexId: number) => doc(db, "pokemonVotes", String(dexId));
const voterRef = (dexId: number, uid: string) => doc(db, "pokemonVotes", String(dexId), "voters", uid);

export async function castVote(dexId: number, uid: string, value: VoteValue): Promise<void> {
  await runTransaction(db, async (tx) => {
    const [tallySnap, voterSnap] = await Promise.all([tx.get(tallyRef(dexId)), tx.get(voterRef(dexId, uid))]);
    const before: VoteValue = voterSnap.exists() ? (voterSnap.data().value as VoteValue) : 0;
    if (before === value) return;
    const tally = tallySnap.exists() ? (tallySnap.data() as VoteTally) : { up: 0, down: 0 };
    const up = tally.up + (value === 1 ? 1 : 0) - (before === 1 ? 1 : 0);
    const down = tally.down + (value === -1 ? 1 : 0) - (before === -1 ? 1 : 0);
    tx.set(tallyRef(dexId), { up, down });
    if (value === 0) tx.delete(voterRef(dexId, uid));
    else tx.set(voterRef(dexId, uid), { value, at: serverTimestamp() });
  });
  invalidateTotals();
}

/** Live tally for one Pokémon. */
export function useTally(dexId: number, enabled = true): VoteTally | null {
  const [tally, setTally] = useState<VoteTally | null>(() => totalsCache?.map.get(dexId) ?? null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      tallyRef(dexId),
      (snap) => setTally(snap.exists() ? (snap.data() as VoteTally) : { up: 0, down: 0 }),
      () => setTally(null),
    );
  }, [dexId, enabled]);
  return tally;
}

/** Live value of the signed-in user's own vote. */
export function useMyVote(dexId: number, uid: string | null | undefined): VoteValue {
  const [value, setValue] = useState<VoteValue>(0);
  useEffect(() => {
    if (!uid) {
      setValue(0);
      return;
    }
    return onSnapshot(
      voterRef(dexId, uid),
      (snap) => setValue(snap.exists() ? (snap.data().value as VoteValue) : 0),
      () => setValue(0),
    );
  }, [dexId, uid]);
  return value;
}

// ---------- all tallies (for popularity sort / quick look), cached for a minute ----------

let totalsCache: { at: number; map: Map<number, VoteTally> } | null = null;
let totalsPromise: Promise<Map<number, VoteTally>> | null = null;
const listeners = new Set<(m: Map<number, VoteTally>) => void>();

function invalidateTotals() {
  if (totalsCache) totalsCache.at = 0;
}

export function fetchTotals(): Promise<Map<number, VoteTally>> {
  if (totalsCache && Date.now() - totalsCache.at < 60_000) return Promise.resolve(totalsCache.map);
  if (totalsPromise) return totalsPromise;
  totalsPromise = getDocs(collection(db, "pokemonVotes"))
    .then((snap) => {
      const map = new Map<number, VoteTally>();
      snap.forEach((d) => map.set(Number(d.id), d.data() as VoteTally));
      totalsCache = { at: Date.now(), map };
      listeners.forEach((l) => l(map));
      return map;
    })
    .finally(() => {
      totalsPromise = null;
    });
  return totalsPromise;
}

export interface TotalsState {
  totals: Map<number, VoteTally>;
  status: "loading" | "ready" | "offline";
}

export function useVoteTotals(): TotalsState {
  const [state, setState] = useState<TotalsState>(() =>
    totalsCache ? { totals: totalsCache.map, status: "ready" } : { totals: new Map(), status: "loading" },
  );
  useEffect(() => {
    const listener = (map: Map<number, VoteTally>) => setState({ totals: map, status: "ready" });
    listeners.add(listener);
    fetchTotals().catch(() => setState((s) => ({ ...s, status: "offline" })));
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return state;
}
