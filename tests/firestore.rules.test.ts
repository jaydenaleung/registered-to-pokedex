import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-registered-pokedex",
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

function vote(db: Firestore, dexId: number, uid: string, tally: { up: number; down: number }, value: 1 | -1 | 0) {
  const batch = writeBatch(db);
  batch.set(doc(db, "pokemonVotes", String(dexId)), tally);
  const voter = doc(db, "pokemonVotes", String(dexId), "voters", uid);
  if (value === 0) batch.delete(voter);
  else batch.set(voter, { value, at: serverTimestamp() });
  return batch.commit();
}

describe("votes", () => {
  it("lets anyone read tallies but not write them directly", async () => {
    await assertSucceeds(getDoc(doc(anon(), "pokemonVotes", "25")));
    await assertFails(setDoc(doc(anon(), "pokemonVotes", "25"), { up: 1, down: 0 }));
    await assertFails(setDoc(doc(as("ash"), "pokemonVotes", "25"), { up: 1, down: 0 }));
  });

  it("accepts a vote that moves the tally by exactly one", async () => {
    await assertSucceeds(vote(as("ash"), 25, "ash", { up: 1, down: 0 }, 1));
  });

  it("rejects inflated tallies", async () => {
    await assertFails(vote(as("ash"), 25, "ash", { up: 5, down: 0 }, 1));
    await assertFails(vote(as("ash"), 25, "ash", { up: 0, down: 1 }, 1));
  });

  it("lets a trainer switch and remove their vote", async () => {
    const db = as("ash");
    await assertSucceeds(vote(db, 25, "ash", { up: 1, down: 0 }, 1));
    await assertFails(vote(db, 25, "ash", { up: 2, down: 0 }, 1)); // same vote twice
    await assertSucceeds(vote(db, 25, "ash", { up: 0, down: 1 }, -1));
    await assertSucceeds(vote(db, 25, "ash", { up: 0, down: 0 }, 0));
  });

  it("keeps votes from different trainers independent", async () => {
    await assertSucceeds(vote(as("ash"), 7, "ash", { up: 1, down: 0 }, 1));
    await assertSucceeds(vote(as("misty"), 7, "misty", { up: 2, down: 0 }, 1));
    await assertFails(vote(as("misty"), 7, "ash", { up: 1, down: 0 }, 0)); // removing someone else's vote
    await assertFails(getDoc(doc(as("misty"), "pokemonVotes", "7", "voters", "ash")));
  });

  it("rejects out-of-range dex numbers", async () => {
    await assertFails(vote(as("ash"), 1026, "ash", { up: 1, down: 0 }, 1));
  });
});

describe("caught log", () => {
  const entry = () => ({
    dexId: 25,
    name: "Pikachu",
    caughtAt: Timestamp.fromDate(new Date("2026-11-05")),
    loggedAt: serverTimestamp(),
    nickname: "Sparky",
    shiny: false,
  });

  it("lets owners log, edit and release; others can't see it", async () => {
    const ref = doc(as("ash"), "users", "ash", "caught", "25");
    await assertSucceeds(setDoc(ref, entry()));
    await assertSucceeds(updateDoc(ref, { note: "Refuses to go in its ball." }));
    await assertFails(getDoc(doc(as("gary"), "users", "ash", "caught", "25")));
    await assertFails(setDoc(doc(as("gary"), "users", "ash", "caught", "25"), entry()));
    await assertSucceeds(deleteDoc(ref));
  });

  it("validates the schema", async () => {
    const db = as("ash");
    await assertFails(setDoc(doc(db, "users", "ash", "caught", "26"), entry())); // dexId mismatch
    await assertFails(setDoc(doc(db, "users", "ash", "caught", "25"), { ...entry(), nickname: "x".repeat(25) }));
    await assertFails(setDoc(doc(db, "users", "ash", "caught", "25"), { ...entry(), level: 100 }));
    await assertFails(setDoc(doc(db, "users", "ash", "caught", "2000"), { ...entry(), dexId: 2000 }));
  });
});

describe("profiles and Professor's notes", () => {
  it("lets owners create a profile but not rewrite createdAt", async () => {
    const ref = doc(as("ash"), "users", "ash");
    await assertSucceeds(setDoc(ref, { displayName: "Ash", photoURL: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { displayName: "Ash K.", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdAt: Timestamp.fromDate(new Date("1996-02-27")), updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(as("gary"), "users", "ash")));
  });

  it("serves notes publicly and only lets the server write them", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, "aiLore", "25"), { text: "hi", model: "m" });
    });
    await assertSucceeds(getDoc(doc(anon(), "aiLore", "25")));
    await assertFails(setDoc(doc(as("ash"), "aiLore", "25"), { text: "pwned" }));
    await assertFails(getDoc(doc(as("ash"), "aiLoreLocks", "25")));
  });
});
