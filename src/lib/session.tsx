import {
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
  sound: boolean;
  setSound: (on: boolean) => void;
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
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, provider);
      } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setAuthError(code === "auth/unauthorized-domain" ? "This domain isn't authorised for sign-in yet." : "Sign-in failed.");
      }
    }
  }, []);

  const signOut = useCallback(() => fbSignOut(auth), []);

  const setSound = useCallback((on: boolean) => {
    setSoundState(on);
    writePref("dex.sound", on);
  }, []);

  const value = useMemo(
    () => ({ user, authReady, signIn, signOut, caught, caughtStatus, authError, sound, setSound }),
    [user, authReady, signIn, signOut, caught, caughtStatus, authError, sound, setSound],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
