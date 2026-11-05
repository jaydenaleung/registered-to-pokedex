import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

/** Caught log: users/{uid}/caught/{dexId} (INSTRUCTIONS.md §7.2). */

export interface CaughtEntry {
  dexId: number;
  name: string;
  caughtAt: Date;
  loggedAt: Date | null;
  nickname?: string;
  location?: string;
  note?: string;
  shiny?: boolean;
}

export interface CaughtInput {
  dexId: number;
  name: string;
  caughtAt: Date;
  nickname?: string;
  location?: string;
  note?: string;
  shiny?: boolean;
}

export const CAUGHT_LIMITS = { nickname: 24, location: 60, note: 280 } as const;

const caughtCol = (uid: string) => collection(db, "users", uid, "caught");

export function subscribeCaught(
  uid: string,
  onData: (entries: Map<number, CaughtEntry>) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    caughtCol(uid),
    (snap) => {
      const map = new Map<number, CaughtEntry>();
      snap.forEach((d) => {
        const v = d.data();
        map.set(Number(d.id), {
          dexId: Number(d.id),
          name: String(v.name ?? ""),
          caughtAt: v.caughtAt instanceof Timestamp ? v.caughtAt.toDate() : new Date(),
          loggedAt: v.loggedAt instanceof Timestamp ? v.loggedAt.toDate() : null,
          nickname: v.nickname,
          location: v.location,
          note: v.note,
          shiny: v.shiny,
        });
      });
      onData(map);
    },
    onError,
  );
}

function clean(s: string | undefined, max: number): string | undefined {
  const t = (s ?? "").trim().slice(0, max);
  return t ? t : undefined;
}

export async function saveCaught(uid: string, input: CaughtInput, existing?: CaughtEntry): Promise<void> {
  const data: Record<string, unknown> = {
    dexId: input.dexId,
    name: input.name.slice(0, 40),
    caughtAt: Timestamp.fromDate(input.caughtAt),
    loggedAt: existing?.loggedAt ? Timestamp.fromDate(existing.loggedAt) : serverTimestamp(),
    shiny: !!input.shiny,
  };
  const nickname = clean(input.nickname, CAUGHT_LIMITS.nickname);
  const location = clean(input.location, CAUGHT_LIMITS.location);
  const note = clean(input.note, CAUGHT_LIMITS.note);
  if (nickname) data.nickname = nickname;
  if (location) data.location = location;
  if (note) data.note = note;
  await setDoc(doc(db, "users", uid, "caught", String(input.dexId)), data);
}

export async function releaseCaught(uid: string, dexId: number): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "caught", String(dexId)));
}
