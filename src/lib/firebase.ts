import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

/**
 * Firebase web config comes from environment variables (VITE_FIREBASE_*), never from the
 * repository: put the values in `.env.local` (gitignored, see `.env.example`).
 * Emulator mode uses an offline demo project and needs no config at all.
 * (The Claude API key never reaches the browser: it lives only in the Cloud Function's secret.)
 */
const env = import.meta.env;

/** `VITE_USE_EMULATORS=1 npm run dev` talks to `firebase emulators:start` instead of production. */
export const USE_EMULATORS = env.DEV && env.VITE_USE_EMULATORS === "1";

const DEMO_PROJECT = "demo-registered-pokedex";

const fromEnv = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

/** True when this build has a real Firebase project to talk to. */
export const FIREBASE_CONFIGURED = !USE_EMULATORS && !!fromEnv.apiKey && !!fromEnv.projectId && !!fromEnv.appId;

// Without a config the app still runs (browsing works offline); Firebase calls just fail softly.
const firebaseConfig = FIREBASE_CONFIGURED
  ? fromEnv
  : { apiKey: "demo-key", projectId: DEMO_PROJECT, authDomain: `${DEMO_PROJECT}.firebaseapp.com`, appId: "demo-app" };

if (!FIREBASE_CONFIGURED && !USE_EMULATORS && env.PROD) {
  console.warn("Firebase isn't configured for this build: sign-in, votes and catch logs are off. See .env.example.");
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

function createFirestore(): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Private mode / no IndexedDB: fall back to the in-memory cache.
    return initializeFirestore(app, {});
  }
}

export const db = createFirestore();
export const functions = getFunctions(app, "us-central1");

if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

if (env.PROD && FIREBASE_CONFIGURED && fromEnv.measurementId) {
  isSupported()
    .then((ok) => {
      if (ok) getAnalytics(app);
    })
    .catch(() => undefined);
}
