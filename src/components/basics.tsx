import { createContext, useContext, useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import type { SpriteSet } from "../lib/sprites";
import { TYPE_COLORS } from "../lib/typeChart";

/** True inside a static "ghost" copy of a page shown during a page flip. */
export const GhostContext = createContext(false);
export const useGhost = () => useContext(GhostContext);

type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  /** Tried in order; the next one is used when an image fails to load. */
  sources: (string | null | undefined)[];
  fallback?: ReactNode;
};

/** <img> with a fallback chain. Every external image is hotlinked, never stored. */
export function Img({ sources, fallback = null, onError, ...rest }: ImgProps) {
  const list = sources.filter((s): s is string => !!s);
  const key = list.join("|");
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [key]);
  if (index >= list.length) return <>{fallback}</>;
  return (
    <img
      {...rest}
      key={list[index]}
      src={list[index]}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={(e) => {
        setIndex((i) => i + 1);
        onError?.(e);
      }}
    />
  );
}

/** A Pokémon sprite from a SpriteSet: still by default, animated when `active`. */
export function SpriteImg({
  set,
  active = false,
  className = "",
  alt = "",
  size,
  eager = false,
}: {
  set: SpriteSet;
  active?: boolean;
  className?: string;
  alt?: string;
  size?: number;
  eager?: boolean;
}) {
  const animating = active && !!set.active;
  const classes = [
    "sprite",
    set.fit ? "sprite--fit" : "",
    set.smooth ? "sprite--smooth" : "",
    set.missing ? "sprite--missing" : "",
    active && !set.active ? "sprite--hop" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Img
      className={classes}
      sources={animating ? set.active! : set.still}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      width={size}
      height={size}
      fallback={<span className="sprite__missing">?</span>}
    />
  );
}

export function TypeBadge({ type, small = false, suffix }: { type: string; small?: boolean; suffix?: string }) {
  return (
    <span
      className={`type-badge${small ? " type-badge--small" : ""}`}
      style={{ ["--type" as string]: TYPE_COLORS[type] ?? "#888" }}
    >
      {type.toUpperCase()}
      {suffix ? <em>{suffix}</em> : null}
    </span>
  );
}

export function TypePip({ type }: { type: string }) {
  return <span className="type-pip" title={type} style={{ ["--type" as string]: TYPE_COLORS[type] ?? "#888" }} />;
}

/** A labelled info chip: [LABEL | value]. */
export function Tag({ label, children, tone }: { label: string; children: ReactNode; tone?: "gold" | "pink" | "dim" }) {
  return (
    <div className={`tag${tone ? ` tag--${tone}` : ""}`}>
      <span className="tag__label">{label}</span>
      <span className="tag__value">{children}</span>
    </div>
  );
}

export const dexNo = (id: number) => `No.${String(id).padStart(id > 999 ? 4 : 3, "0")}`;

// ---------- pixel-art Poké Ball (original 16×16 drawing) ----------

const BALL_ROWS = [
  "     XXXXXX     ",
  "   XXRRRRRRXX   ",
  "  XRRRRRRRRRRX  ",
  " XRHHRRRRRRRRDX ",
  " XRHRRRRRRRRRDX ",
  "XRRRRRRRRRRRRDDX",
  "XDRRRRRXXRRRRDDX",
  "XXXXXXXWWXXXXXXX",
  "XXXXXXXWWXXXXXXX",
  "XWWWWWWXXWWWWWGX",
  "XWWWWWWWWWWWWWGX",
  " XWWWWWWWWWWWGX ",
  " XWWWWWWWWWWGGX ",
  "  XWWWWWWWWGGX  ",
  "   XXGGGGGGXX   ",
  "     XXXXXX     ",
];

const BALL_COLORS: Record<string, string> = {
  X: "#141414",
  R: "#e3350d",
  D: "#a1200a",
  H: "#ffb0a0",
  W: "#f4f4f4",
  G: "#b9b9c4",
};

function pixels(rows: string[], offsetY = 0) {
  const rects: ReactNode[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== " ") rects.push(<rect key={`${x}-${y}`} x={x} y={y + offsetY} width={1} height={1} fill={BALL_COLORS[c]} />);
    }),
  );
  return rects;
}

/** Poké Ball split into halves so the top can swing open. */
export function PixelBall({ part = "whole", className }: { part?: "whole" | "top" | "bottom"; className?: string }) {
  const rows = part === "top" ? BALL_ROWS.slice(0, 8) : part === "bottom" ? BALL_ROWS.slice(8) : BALL_ROWS;
  const h = rows.length;
  return (
    <svg className={className} viewBox={`0 0 16 ${h}`} width={16} height={h} shapeRendering="crispEdges" aria-hidden="true">
      {pixels(rows)}
    </svg>
  );
}

export function Loading({ label = "LOADING" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      {label}
      <span className="blink">▮</span>
    </div>
  );
}
