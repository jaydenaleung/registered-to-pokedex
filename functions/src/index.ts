/**
 * Cloud Functions for Registered-to-Pokédex (INSTRUCTIONS.md §6).
 *
 * professorNotes({ dexId }): returns a short Claude-written field note for one species.
 * - Facts come only from the bundled species-facts.json (never from the client).
 * - Each note is generated once, stored in aiLore/{dexId}, and served from there after.
 * - The Claude API key is a Firebase secret:  firebase functions:secrets:set ANTHROPIC_API_KEY
 */
import Anthropic from "@anthropic-ai/sdk";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { loadFacts, writeNote } from "./professor.js";

initializeApp();
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const MAX_ID = 1025;
const LOCK_TTL_MS = 3 * 60 * 1000;
const FACTS = loadFacts();

async function acquireLock(dexId: number): Promise<boolean> {
  const ref = db.doc(`aiLoreLocks/${dexId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const at = snap.exists ? (snap.get("at") as Timestamp | undefined) : undefined;
    if (at && Date.now() - at.toMillis() < LOCK_TTL_MS) return false;
    tx.set(ref, { at: Timestamp.now() });
    return true;
  });
}

export const professorNotes = onCall(
  {
    region: "us-central1",
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "256MiB",
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to ask the Professor.");
    const dexId = Number((request.data as { dexId?: unknown } | undefined)?.dexId);
    if (!Number.isInteger(dexId) || dexId < 1 || dexId > MAX_ID) {
      throw new HttpsError("invalid-argument", "dexId must be a National Dex number from 1 to 1025.");
    }
    const facts = FACTS[String(dexId)];
    if (!facts) throw new HttpsError("not-found", "Unknown species.");

    const noteRef = db.doc(`aiLore/${dexId}`);
    const cached = await noteRef.get();
    if (cached.exists) return { text: cached.get("text") as string, model: cached.get("model") as string };

    if (!(await acquireLock(dexId))) {
      throw new HttpsError("resource-exhausted", "This note is being written right now. Try again shortly.");
    }

    try {
      const again = await noteRef.get();
      if (again.exists) return { text: again.get("text") as string, model: again.get("model") as string };

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
      const note = await writeNote(client, dexId, facts);
      await noteRef.set({ ...note, dexId, createdAt: FieldValue.serverTimestamp() });
      logger.info("Professor's note written", { dexId, uid: request.auth.uid, model: note.model });
      return note;
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (err instanceof Anthropic.RateLimitError) {
        throw new HttpsError("resource-exhausted", "The Professor is busy. Try again in a minute.");
      }
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        logger.error("Claude API key rejected; check the ANTHROPIC_API_KEY secret", { status: err.status });
        throw new HttpsError("internal", "The Professor's lab is misconfigured.");
      }
      if (err instanceof Anthropic.APIError) {
        logger.error("Claude API error", { status: err.status, message: err.message });
        throw new HttpsError("unavailable", "The Professor can't be reached right now.");
      }
      logger.error("Unexpected error writing note", err);
      throw new HttpsError("internal", "Something went wrong in the lab.");
    } finally {
      await db.doc(`aiLoreLocks/${dexId}`).delete().catch(() => undefined);
    }
  },
);
