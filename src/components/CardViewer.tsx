import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cardSources, officialArt } from "../lib/sprites";
import type { Card, SpeciesSummary } from "../lib/types";
import { Img, useGhost } from "./basics";

/** Official TCG card art (featured first) with ◀ n/N ▶, an artwork toggle and a lightbox. */
export function CardViewer({ species, cards, pid = species.id, name = species.name }: { species: SpeciesSummary; cards: Card[]; pid?: number; name?: string }) {
  const ghost = useGhost();
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<"card" | "art">(cards.length ? "card" : "art");
  const [zoom, setZoom] = useState(false);
  const card = cards[i];
  const sources = mode === "card" ? cardSources(card, species, pid) : officialArt(species, pid);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const alt =
    mode === "card" && card ? `${card.name} card from ${card.set}${card.artist ? `, illustrated by ${card.artist}` : ""}` : `${name} official artwork`;

  return (
    <div className="cards">
      <div className="cards__tabs" role="tablist" aria-label="Art type">
        <button type="button" role="tab" aria-selected={mode === "card"} className={mode === "card" ? "is-on" : ""} onClick={() => setMode("card")} disabled={!cards.length}>
          CARD
        </button>
        <button type="button" role="tab" aria-selected={mode === "art"} className={mode === "art" ? "is-on" : ""} onClick={() => setMode("art")}>
          ARTWORK
        </button>
      </div>
      <button type="button" className={`cards__frame cards__frame--${mode}`} onClick={() => !ghost && setZoom(true)} aria-label="Enlarge image">
        <Img
          key={`${mode}-${i}`}
          sources={sources}
          alt={alt}
          loading={ghost ? "eager" : "lazy"}
          fallback={<span className="cards__missing">NO IMAGE</span>}
        />
      </button>
      {mode === "card" && card && (
        <div className="cards__meta">
          <button type="button" className="btn btn--small" onClick={() => setI((i - 1 + cards.length) % cards.length)} aria-label="Previous card" disabled={cards.length < 2}>
            ◀
          </button>
          <div className="cards__caption">
            <strong>{card.set}</strong>
            <span>
              {card.rarity ?? "Promo"} · #{card.number} · {card.date.slice(0, 4)}
            </span>
            {card.artist && <span>Illus. {card.artist}</span>}
          </div>
          <button type="button" className="btn btn--small" onClick={() => setI((i + 1) % cards.length)} aria-label="Next card" disabled={cards.length < 2}>
            ▶
          </button>
        </div>
      )}
      {mode === "card" && cards.length > 1 && (
        <div className="cards__count">
          CARD {i + 1}/{cards.length}
        </div>
      )}
      {mode === "art" && <div className="cards__count">ARTWORK · BULBAPEDIA</div>}
      {zoom &&
        createPortal(
          <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setZoom(false)}>
            <Img sources={sources} alt={alt} />
            <span className="lightbox__hint">CLICK OR ESC TO CLOSE</span>
          </div>,
          document.body,
        )}
    </div>
  );
}
