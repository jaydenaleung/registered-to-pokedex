import { useState } from "react";
import { useSession } from "../lib/session";
import { castVote, useMyVote, useTally, type VoteValue } from "../lib/votes";
import { useGhost } from "./basics";

/** ▲ score ▼, one vote per trainer, changeable or removable (INSTRUCTIONS.md G5). */
export function VoteButtons({ dexId, name }: { dexId: number; name: string }) {
  const ghost = useGhost();
  const { user, signIn } = useSession();
  const tally = useTally(dexId, !ghost);
  const mine = useMyVote(dexId, ghost ? null : user?.uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vote = async (value: 1 | -1) => {
    if (!user) {
      await signIn();
      return;
    }
    const next: VoteValue = mine === value ? 0 : value;
    setBusy(true);
    setError(null);
    try {
      await castVote(dexId, user.uid, next);
    } catch {
      setError("Vote didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const s = tally ? tally.up - tally.down : null;
  return (
    <div className="votes" role="group" aria-label={`Vote on ${name}`}>
      <button
        type="button"
        className={`vote vote--up${mine === 1 ? " is-on" : ""}`}
        onClick={() => vote(1)}
        disabled={busy}
        aria-pressed={mine === 1}
        title={user ? "Upvote" : "Sign in to vote"}
      >
        ▲<span>{tally?.up ?? "–"}</span>
      </button>
      <span className="votes__score" title="Score = up − down">
        {s === null ? "—" : s > 0 ? `+${s}` : s}
      </span>
      <button
        type="button"
        className={`vote vote--down${mine === -1 ? " is-on" : ""}`}
        onClick={() => vote(-1)}
        disabled={busy}
        aria-pressed={mine === -1}
        title={user ? "Downvote" : "Sign in to vote"}
      >
        ▼<span>{tally?.down ?? "–"}</span>
      </button>
      {error && (
        <span className="votes__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
