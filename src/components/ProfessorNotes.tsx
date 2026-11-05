import { useEffect, useState } from "react";
import { getCachedNote, professorError, requestNote, type AiNote } from "../lib/aiNotes";
import { useSession } from "../lib/session";
import { Loading, useGhost } from "./basics";

/** Claude-written field notes, generated once per species and cached (INSTRUCTIONS.md §6). */
export function ProfessorNotes({ dexId, name }: { dexId: number; name: string }) {
  const ghost = useGhost();
  const { user, signIn } = useSession();
  const [note, setNote] = useState<AiNote | null>(null);
  const [status, setStatus] = useState<"checking" | "none" | "writing" | "ready" | "error">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ghost) return;
    let alive = true;
    setNote(null);
    setStatus("checking");
    getCachedNote(dexId)
      .then((n) => {
        if (!alive) return;
        setNote(n);
        setStatus(n ? "ready" : "none");
      })
      .catch(() => alive && setStatus("none"));
    return () => {
      alive = false;
    };
  }, [dexId, ghost]);

  const ask = async () => {
    if (!user) {
      await signIn();
      return;
    }
    setStatus("writing");
    setError(null);
    try {
      const n = await requestNote(dexId);
      setNote(n);
      setStatus("ready");
    } catch (err) {
      setError(professorError(err));
      setStatus("error");
    }
  };

  return (
    <section className="prof" aria-label="Professor's notes">
      <h3 className="prof__title">PROF. NOTES</h3>
      {status === "checking" && !ghost && <Loading label="CHECKING THE LAB" />}
      {status === "ready" && note && (
        <>
          {note.text.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="body-text">
              {p}
            </p>
          ))}
          <p className="prof__credit">Written by Claude from official Pokédex data.</p>
        </>
      )}
      {(status === "none" || status === "error" || ghost) && (
        <>
          <p className="body-text dim">
            {error ?? `The Professor hasn't written up ${name} yet. Notes are written once and shared with every trainer.`}
          </p>
          <button type="button" className="btn btn--blue" onClick={ask} disabled={ghost}>
            {user ? "ASK THE PROFESSOR" : "SIGN IN TO ASK"}
          </button>
        </>
      )}
      {status === "writing" && <Loading label="THE PROFESSOR IS WRITING" />}
    </section>
  );
}
