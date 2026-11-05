import { Link } from "react-router-dom";
import { staticSprites } from "../lib/sprites";
import type { EvoNode } from "../lib/types";
import { dexNo, Img } from "./basics";

function Node({ node, current }: { node: EvoNode; current: number }) {
  return (
    <div className="evo__branch">
      <Link to={`/pokemon/${node.id}`} className={`evo__mon${node.id === current ? " is-current" : ""}`} aria-current={node.id === current ? "page" : undefined}>
        <Img sources={staticSprites(node.id)} alt="" width={64} height={64} loading="lazy" />
        <span className="evo__no">{dexNo(node.id)}</span>
        <span className="evo__name">{node.name}</span>
      </Link>
      {node.children.length > 0 && (
        <div className={`evo__children${node.children.length > 2 ? " evo__children--many" : ""}`}>
          {node.children.map((child) => (
            <div className="evo__step" key={child.id}>
              <div className="evo__arrow">
                <span className="evo__arrow-glyph" aria-hidden="true">
                  ▶
                </span>
                <span className="evo__cond">
                  {(child.condition ?? "Special").split(" or ").map((c, i) => (
                    <span key={i}>{i > 0 ? `or ${c}` : c}</span>
                  ))}
                </span>
              </div>
              <Node node={child} current={current} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EvolutionTree({ tree, current }: { tree: EvoNode | null; current: number }) {
  if (!tree) return <p className="body-text dim">No evolution data.</p>;
  if (!tree.children.length) {
    return (
      <div className="evo">
        <Node node={tree} current={current} />
        <p className="body-text dim">This Pokémon does not evolve.</p>
      </div>
    );
  }
  return (
    <div className="evo">
      <Node node={tree} current={current} />
    </div>
  );
}
