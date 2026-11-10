import { useState } from "react";
import { Link } from "react-router-dom";
import { dexNo, Loading, PixelBall, SpriteImg } from "../components/basics";
import { romanGen, GEN_REGION } from "../lib/age";
import { releaseCaught, type CaughtEntry } from "../lib/caught";
import { useGame, useSession } from "../lib/session";
import { tileSprites } from "../lib/sprites";
import type { SpeciesSummary } from "../lib/types";

const TOTAL = 1025;

function SignInPrompt() {
  const { signIn, authReady } = useSession();
  return (
    <div className="page-pad page-pad--center empty">
      <PixelBall className="empty__ball" />
      <h2 className="page-title">TRAINER CARD</h2>
      <p className="body-text">Sign in with Google to vote, log the Pokémon you catch, and track your completion.</p>
      <button type="button" className="btn btn--yellow" onClick={signIn} disabled={!authReady}>
        SIGN IN
      </button>
    </div>
  );
}

export function TrainerLeft({ index }: { index: SpeciesSummary[] | undefined }) {
  const { user, caught, caughtStatus, signOut } = useSession();
  if (!user) return <SignInPrompt />;
  const count = caught.size;
  const byGen = new Map<number, { total: number; caught: number }>();
  for (const s of index ?? []) {
    const g = byGen.get(s.gen) ?? { total: 0, caught: 0 };
    g.total++;
    if (caught.has(s.id)) g.caught++;
    byGen.set(s.gen, g);
  }
  const shinies = [...caught.values()].filter((c) => c.shiny).length;
  const since = user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : "—";

  return (
    <div className="trainer">
      <div className="trainer-card textbox">
        <div className="trainer-card__photo">
          {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <PixelBall />}
        </div>
        <dl className="trainer-card__info">
          <div>
            <dt>NAME</dt>
            <dd>{(user.displayName ?? "Trainer").toUpperCase()}</dd>
          </div>
          <div>
            <dt>SINCE</dt>
            <dd>{since}</dd>
          </div>
          <div>
            <dt>SHINY ★</dt>
            <dd>{shinies}</dd>
          </div>
        </dl>
      </div>

      <div className="caught-count" aria-live="polite">
        <span className="caught-count__label">CAUGHT</span>
        <span className="caught-count__num">{caughtStatus === "loading" ? "…" : count}</span>
        <span className="caught-count__total">/ {TOTAL}</span>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={count}>
        <span style={{ width: `${(count / TOTAL) * 100}%` }} />
      </div>
      {caughtStatus === "error" && <p className="form-error">Couldn't load your log (offline?).</p>}

      <h3 className="section-title">BY GENERATION</h3>
      <ul className="gen-progress">
        {[...byGen.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([gen, g]) => (
            <li key={gen}>
              <Link to={`/?q=gen:${gen}`}>
                GEN {romanGen(gen)} <small>{GEN_REGION[gen]}</small>
              </Link>
              <span className="progress progress--mini">
                <span style={{ width: `${(g.caught / g.total) * 100}%` }} />
              </span>
              <b>
                {g.caught}/{g.total}
              </b>
            </li>
          ))}
      </ul>
      <div className="trainer__actions">
        <Link to="/?q=missing" className="btn btn--small">
          SHOW MISSING
        </Link>
        <button type="button" className="btn btn--small" onClick={() => void signOut()}>
          SIGN OUT
        </button>
      </div>
    </div>
  );
}

export function TrainerRight() {
  const { user, caught, caughtStatus } = useSession();
  const [editing, setEditing] = useState<number | null>(null);
  const game = useGame();
  if (!user) {
    return (
      <div className="page-pad page-pad--center">
        <p className="body-text">Your caught log will appear here.</p>
      </div>
    );
  }
  if (caughtStatus === "loading") return <div className="page-pad page-pad--center"><Loading /></div>;
  const entries: CaughtEntry[] = [...caught.values()].sort((a, b) => b.caughtAt.getTime() - a.caughtAt.getTime());

  if (!entries.length) {
    return (
      <div className="page-pad page-pad--center">
        <h2 className="page-title">NO CATCHES YET</h2>
        <p className="body-text">Open any Pokémon's page and press LOG CATCH.</p>
        <Link to="/" className="btn btn--blue">
          BROWSE POKéDEX
        </Link>
      </div>
    );
  }

  return (
    <div className="caught-log">
      <h2 className="page-title">CAUGHT LOG</h2>
      <div className="caught-grid">
        {[...entries]
          .sort((a, b) => a.dexId - b.dexId)
          .map((e) => (
            <Link key={e.dexId} to={`/pokemon/${e.dexId}`} className="caught-grid__mon" title={`${dexNo(e.dexId)} ${e.name}`}>
              <SpriteImg set={tileSprites({ pid: e.dexId, anim: null }, game)} alt={e.name} size={56} />
              {e.shiny && <span className="caught-grid__shiny">★</span>}
            </Link>
          ))}
      </div>
      <div className="table-scroll">
        <table className="log-table">
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">POKéMON</th>
              <th scope="col">WHERE</th>
              <th scope="col">DATE</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.dexId}>
                <td>{String(e.dexId).padStart(3, "0")}</td>
                <td>
                  <Link to={`/pokemon/${e.dexId}`}>{e.nickname ? `${e.nickname} (${e.name})` : e.name}</Link>
                  {e.shiny && " ★"}
                  {e.note && <div className="log-table__note">{e.note}</div>}
                </td>
                <td>{e.location ?? "—"}</td>
                <td>{e.caughtAt.toLocaleDateString()}</td>
                <td>
                  {editing === e.dexId ? (
                    <span className="log-table__confirm">
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                          void releaseCaught(user.uid, e.dexId);
                          setEditing(null);
                        }}
                      >
                        RELEASE
                      </button>
                      <button type="button" className="btn btn--small" onClick={() => setEditing(null)}>
                        KEEP
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn--small" onClick={() => setEditing(e.dexId)} aria-label={`Release ${e.name}`}>
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
