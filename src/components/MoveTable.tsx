import { useState } from "react";
import { useMoves } from "../lib/data";
import type { Learnset, MoveDict } from "../lib/types";
import { Loading, TypeBadge } from "./basics";

const CAT: Record<string, string> = { physical: "PHY", special: "SPE", status: "STA" };

function MoveChips({ ids, moves, label }: { ids: number[]; moves: MoveDict; label: string }) {
  const [open, setOpen] = useState(false);
  if (!ids.length) return null;
  return (
    <div className="move-group">
      <button type="button" className="move-group__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "▼" : "▶"} {label} ({ids.length})
      </button>
      {open && (
        <ul className="move-chips">
          {ids.map((id) => {
            const m = moves[id];
            if (!m) return null;
            return (
              <li key={id} title={`${m[1]} · ${m[2]}${m[3] ? ` · ${m[3]} power` : ""}`}>
                <TypeBadge type={m[1]} small />
                {m[0]}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MoveTable({ learnset }: { learnset: Learnset | null }) {
  const { data: moves, error } = useMoves();
  if (!learnset) return <p className="body-text dim">No move data recorded.</p>;
  if (error) return <p className="body-text">Couldn't load moves.</p>;
  if (!moves) return <Loading />;
  return (
    <div className="moves">
      <p className="moves__game">LEVEL-UP MOVES · {learnset.game.toUpperCase()}</p>
      <div className="table-scroll">
        <table className="move-table">
          <thead>
            <tr>
              <th scope="col">LV</th>
              <th scope="col">MOVE</th>
              <th scope="col">TYPE</th>
              <th scope="col">CAT</th>
              <th scope="col">PWR</th>
              <th scope="col">ACC</th>
              <th scope="col">PP</th>
            </tr>
          </thead>
          <tbody>
            {learnset.level.map(([lvl, id]) => {
              const m = moves[id];
              if (!m) return null;
              return (
                <tr key={`${lvl}-${id}`}>
                  <td>{lvl === 0 ? "EVO" : lvl}</td>
                  <td className="move-table__name">{m[0]}</td>
                  <td>
                    <TypeBadge type={m[1]} small />
                  </td>
                  <td>
                    <span className={`cat cat--${m[2]}`}>{CAT[m[2]]}</span>
                  </td>
                  <td>{m[3] ?? "—"}</td>
                  <td>{m[4] ?? "—"}</td>
                  <td>{m[5] ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <MoveChips ids={learnset.machine} moves={moves} label="TM MOVES" />
      <MoveChips ids={learnset.egg} moves={moves} label="EGG MOVES" />
      <MoveChips ids={learnset.tutor} moves={moves} label="TUTOR MOVES" />
    </div>
  );
}
