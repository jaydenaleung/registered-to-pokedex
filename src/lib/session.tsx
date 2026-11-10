import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { subscribeCaught, type CaughtEntry } from "./caught";
import { useGames } from "./data";
import type { GameDef } from "./types";
import { auth, db, USE_EMULATORS } from "./firebase";

/** Signed-in trainer, their caught log, and per-browser preferences. */

interface SessionValue {
  user: User | null;
  authReady: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  caught: Map<number, CaughtEntry>;
  caughtStatus: "idle" | "loading" | "ready" | "error";
  authError: string | null;
  clearAuthError: () => void;
  sound: boolean;
  setSound: (on: boolean) => void;
  /** Selected game mode (null = modern sprites). */
  gameId: string | null;
  setGameId: (id: string | null) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

const EMPTY = new Map<number, CaughtEntry>();

function readPref(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writePref(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* storage unavailable: preference lasts for this visit only */
  }
}

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function writeString(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

const inIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/**
 * After a failed sign-in, ask Firebase Auth what's wrong with the project setup. The same public
 * endpoint the SDK uses reports CONFIGURATION_NOT_FOUND when Authentication was never switched on,
 * and lists the authorised domains otherwise.
 */
async function diagnoseAuthSetup(): Promise<string | null> {
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(auth.app.options.apiKey ?? "")}`);
    const body = (await res.json()) as { error?: { message?: string }; authorizedDomains?: string[] };
    if (body.error?.message?.startsWith("CONFIGURATION_NOT_FOUND")) return "auth/configuration-not-found";
    if (body.authorizedDomains && !body.authorizedDomains.includes(window.location.hostname)) return "auth/unauthorized-domain";
  } catch {
    /* offline: keep the original error */
  }
  return null;
}

/** Turns a Firebase Auth error into something the trainer (or site owner) can act on. */
export function describeAuthError(code: string): string {
  switch (code) {
    case "auth/configuration-not-found":
      return "Sign-in isn't switched on for this site yet. Site owner: Firebase console → Authentication → Get started, then enable Google.";
    case "auth/operation-not-allowed":
      return "Google sign-in is turned off. Site owner: Firebase console → Authentication → Sign-in method → enable Google.";
    case "auth/unauthorized-domain":
      return `This address (${window.location.hostname}) isn't allowed to sign in. Site owner: add it under Authentication → Settings → Authorized domains.`;
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
    case "auth/network-request-failed":
      return "Couldn't reach Google. Check your connection and try again.";
    case "auth/internal-error":
      return "Google sign-in hit an error. Try again, or open the site in its own browser tab.";
    case "auth/web-storage-unsupported":
      return "Your browser is blocking the storage sign-in needs. Allow cookies for this site or turn off private mode.";
    default:
      return `Sign-in failed${code ? ` (${code})` : ""}.${inIframe() ? " Try opening the site in its own browser tab." : ""}`;
  }
}

async function upsertProfile(user: User) {
  const ref = doc(db, "users", user.uid);
  const profile = { displayName: user.displayName ?? null, photoURL: user.photoURL ?? null };
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { ...profile, updatedAt: serverTimestamp() });
  else await setDoc(ref, { ...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

// Emulator-only helper so local end-to-end tests can sign in without the Google popup.
if (USE_EMULATORS && typeof window !== "undefined") {
  (window as unknown as { __dexEmulatorSignIn?: (name: string) => Promise<void> }).__dexEmulatorSignIn = async (name) => {
    const fakeIdToken = JSON.stringify({ sub: name.toLowerCase(), email: `${name.toLowerCase()}@example.com`, name, email_verified: true });
    await signInWithCredential(auth, GoogleAuthProvider.credential(fakeIdToken));
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [caught, setCaught] = useState<Map<number, CaughtEntry>>(EMPTY);
  const [caughtStatus, setCaughtStatus] = useState<SessionValue["caughtStatus"]>("idle");
  const [sound, setSoundState] = useState(() => readPref("dex.sound"));
  const [gameId, setGameIdState] = useState<string | null>(() => readString("dex.game"));

  useEffect(
    () =>
      onAuthStateChanged(
        auth,
        (u) => {
          setUser(u);
          setAuthReady(true);
          if (u) upsertProfile(u).catch(() => undefined);
        },
        () => setAuthReady(true),
      ),
    [],
  );

  useEffect(() => {
    if (!user) {
      setCaught(EMPTY);
      setCaughtStatus("idle");
      return;
    }
    setCaughtStatus("loading");
    return subscribeCaught(
      user.uid,
      (map) => {
        setCaught(map);
        setCaughtStatus("ready");
      },
      () => setCaughtStatus("error"),
    );
  }, [user]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled") return;
      // Embedded views (iframes, in-app browsers) often can't open pop-ups: fall back to a full-page redirect.
      if ((code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") && !inIframe()) {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr) {
          setAuthError(describeAuthError((redirectErr as { code?: string }).code ?? ""));
          return;
        }
      }
      console.error("Sign-in failed", err);
      setAuthError(describeAuthError((await diagnoseAuthSetup()) ?? code));
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  // Surface errors from a redirect sign-in that came back to the page.
  useEffect(() => {
    getRedirectResult(auth).catch((err) => setAuthError(describeAuthError((err as { code?: string }).code ?? "")));
  }, []);

  const signOut = useCallback(() => fbSignOut(auth), []);

  const setSound = useCallback((on: boolean) => {
    setSoundState(on);
    writePref("dex.sound", on);
  }, []);

  const setGameId = useCallback((id: string | null) => {
    setGameIdState(id);
    writeString("dex.game", id);
  }, []);

  const value = useMemo(
    () => ({ user, authReady, signIn, signOut, caught, caughtStatus, authError, clearAuthError, sound, setSound, gameId, setGameId }),
    [user, authReady, signIn, signOut, caught, caughtStatus, authError, clearAuthError, sound, setSound, gameId, setGameId],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** The selected game mode's definition, or null for modern sprites. */
export function useGame(): GameDef | null {
  const { gameId } = useSession();
  const { data: games } = useGames();
  return useMemo(() => (gameId && games ? (games.find((g) => g.id === gameId) ?? null) : null), [gameId, games]);
}
