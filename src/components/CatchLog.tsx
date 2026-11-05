import { useEffect, useRef, useState, type FormEvent } from "react";
import { CAUGHT_LIMITS, releaseCaught, saveCaught, type CaughtEntry } from "../lib/caught";
import { useSession } from "../lib/session";
import type { SpeciesSummary } from "../lib/types";
import { PixelBall, useGhost } from "./basics";

const toDateInput = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

/** LOG CATCH / CAUGHT ✓ with edit and release (INSTRUCTIONS.md G6). */
export function CatchButton({ species }: { species: SpeciesSummary }) {
  const ghost = useGhost();
  const { user, signIn, caught } = useSession();
  // Separate flags so the "log" dialog unmounts as soon as the catch appears
  // (Firestore applies the write locally before the server confirms it).
  const [logOpen, setLogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const entry = caught.get(species.id);

  if (entry) {
    return (
      <div className="catch">
        <button type="button" className="btn btn--green" onClick={() => !ghost && setEditOpen(true)} title="Edit catch log">
          ✓ CAUGHT {entry.shiny ? "★" : ""}
        </button>
        <span className="catch__meta">
          {entry.nickname ? `“${entry.nickname}” · ` : ""}
          {entry.caughtAt.toLocaleDateString()}
        </span>
        {editOpen && <CatchDialog species={species} existing={entry} onClose={() => setEditOpen(false)} />}
      </div>
    );
  }
  return (
    <div className="catch">
      <button
        type="button"
        className="btn btn--red catch__log"
        onClick={() => {
          if (ghost) return;
          if (!user) void signIn();
          else setLogOpen(true);
        }}
        title={user ? "Log this catch" : "Sign in to log catches"}
      >
        <PixelBall className="catch__ball" /> LOG CATCH
      </button>
      {logOpen && <CatchDialog species={species} onClose={() => setLogOpen(false)} />}
    </div>
  );
}

function CatchDialog({ species, existing, onClose }: { species: SpeciesSummary; existing?: CaughtEntry; onClose: () => void }) {
  const { user } = useSession();
  const [nickname, setNickname] = useState(existing?.nickname ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [date, setDate] = useState(toDateInput(existing?.caughtAt ?? new Date()));
  const [shiny, setShiny] = useState(!!existing?.shiny);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!user) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const [y, m, d] = date.split("-").map(Number);
      await saveCaught(
        user.uid,
        { dexId: species.id, name: species.name, caughtAt: new Date(y, (m || 1) - 1, d || 1, 12), nickname, location, note, shiny },
        existing,
      );
      onClose();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
      setBusy(false);
    }
  };

  const release = async () => {
    if (!window.confirm(`Release ${existing?.nickname || species.name}? This removes it from your log.`)) return;
    setBusy(true);
    try {
      await releaseCaught(user.uid, species.id);
      onClose();
    } catch {
      setError("Couldn't release. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal__box textbox" role="dialog" aria-modal="true" aria-labelledby="catch-title" onSubmit={submit}>
        <h2 id="catch-title" className="page-title">
          {existing ? "EDIT CATCH" : `GOTCHA! ${species.name.toUpperCase()} WAS CAUGHT!`}
        </h2>
        <label className="field">
          <span>NICKNAME</span>
          <input ref={firstField} value={nickname} maxLength={CAUGHT_LIMITS.nickname} onChange={(e) => setNickname(e.target.value)} placeholder={species.name} />
        </label>
        <label className="field">
          <span>WHERE / GAME</span>
          <input value={location} maxLength={CAUGHT_LIMITS.location} onChange={(e) => setLocation(e.target.value)} placeholder="Viridian Forest · Pokémon Yellow" />
        </label>
        <label className="field">
          <span>DATE</span>
          <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>NOTES</span>
          <textarea value={note} maxLength={CAUGHT_LIMITS.note} rows={3} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="field field--check">
          <input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} />
          <span>SHINY ★</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          {existing && (
            <button type="button" className="btn btn--small" onClick={release} disabled={busy}>
              RELEASE
            </button>
          )}
          <button type="button" className="btn btn--small" onClick={onClose} disabled={busy}>
            CANCEL
          </button>
          <button type="submit" className="btn btn--red" disabled={busy}>
            {busy ? "SAVING…" : "SAVE"}
          </button>
        </div>
      </form>
    </div>
  );
}
