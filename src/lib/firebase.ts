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
 * Firebase web config. This is a public client identifier by design; access is
 * enforced by firestore.rules and the project's authorised domains.
 * (The Claude API key is NOT here: it lives only in the Cloud Function's secret.)
 */
const firebaseConfig = {
  apiKey: "AIzaSyA2cYPuhEcCKg3J_uSMVeYtDiO_YhC6HSs",
  authDomain: "registered-to-pokedex.firebaseapp.com",
  projectId: "registered-to-pokedex",
  storageBucket: "registered-to-pokedex.firebasestorage.app",
  messagingSenderId: "811588813548",
  appId: "1:811588813548:web:b02496a9050fcb485b1bc9",
  measurementId: "G-JGSCJWTTBP",
};

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

/** `VITE_USE_EMULATORS=1 npm run dev` talks to `firebase emulators:start` instead of production. */
export const USE_EMULATORS = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "1";

if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

if (import.meta.env.PROD) {
  isSupported()
    .then((ok) => {
      if (ok) getAnalytics(app);
    })
    .catch(() => undefined);
}
