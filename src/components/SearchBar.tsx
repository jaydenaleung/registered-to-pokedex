import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GEN_REGION, romanGen } from "../lib/age";
import { exactMatch, getToken, setToken, SORT_LABELS, suggestions, type SortKey } from "../lib/search";
import { useGame } from "../lib/session";
import { tileSprites } from "../lib/sprites";
import { TYPE_IDS } from "../lib/typeChart";
import type { SpeciesSummary } from "../lib/types";
import { dexNo, SpriteImg } from "./basics";

/** Search bar + Type/Gen/Sort dropdowns + help (INSTRUCTIONS.md §2.3). */

const HELP: [string, string][] = [
  ["pika", "name contains"],
  ["#25  ·  1-151", "number / range"],
  ["fire  ·  type:fire type:flying", "type(s)"],
  ["gen:3  ·  gen3  ·  hoenn", "generation / region"],
  ["legendary  ·  mythical  ·  baby", "special status"],
  ["alolan · galarian · hisuian · paldean", "regional forms"],
  ["mega  ·  gmax  ·  primal  ·  forms", "other forms"],
  ["weak:ice", "takes ≥2× from Ice"],
  ["caught  ·  missing", "your caught log"],
  ["sort:popular  ·  sort:unpopular", "by votes"],
  ["sort:name · sort:bst · sort:catch · sort:easy", "other orders"],
];

export function SearchBar({ index }: { index: SpeciesSummary[] | undefined }) {
  const location = useLocation();
  const navigate = useNavigate();
  const onIndex = location.pathname === "/";
  const urlQuery = onIndex ? (new URLSearchParams(location.search).get("q") ?? "") : null;
  const [text, setText] = useState(urlQuery ?? "");
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();
  const game = useGame();

  // Keep the box in sync when the URL query changes (back button, dropdowns, links).
  useEffect(() => {
    if (urlQuery !== null) setText(urlQuery);
  }, [urlQuery]);

  // "/" focuses the search box.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !/input|textarea|select/i.test(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goIndex = (q: string, replace = false) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const search = params.toString();
    navigate(search ? `/?${search}` : "/", { replace });
  };

  const onChange = (value: string) => {
    setText(value);
    setHighlight(0);
    setOpen(true);
    if (onIndex) {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => goIndex(value, true), 160);
    }
  };

  const sugg = index && open && text.trim() ? suggestions(text, index) : [];

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    setOpen(false);
    if (sugg.length && highlight > 0) {
      navigate(`/pokemon/${sugg[highlight - 1].id}`);
      return;
    }
    const exact = index ? exactMatch(text, index) : null;
    if (exact) navigate(`/pokemon/${exact.id}`);
    else goIndex(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && sugg.length) {
      e.preventDefault();
      setHighlight((h) => Math.min(sugg.length, h + 1));
    } else if (e.key === "ArrowUp" && sugg.length) {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setHelp(false);
    }
  };

  const setFilter = (key: "type" | "gen" | "sort", value: string) => {
    const next = setToken(text, key, value || null);
    setText(next);
    goIndex(next);
  };

  const typeValue = getToken(text, "type") ?? "";
  const genValue = getToken(text, "gen") ?? "";
  const sortToken = getToken(text, "sort");
  const sortValue = !sortToken || sortToken === "num" ? "" : sortToken;

  return (
    <div className="search">
      <form className="search__form" role="search" onSubmit={submit}>
        <label className="visually-hidden" htmlFor={`${listId}-input`}>
          Search the Pokédex
        </label>
        <input
          id={`${listId}-input`}
          ref={inputRef}
          className="search__input"
          type="search"
          value={text}
          placeholder="Search name, #, type, gen…  ( / )"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={sugg.length > 0}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <button className="btn btn--blue search__go" type="submit" aria-label="Search">
          GO
        </button>
        <button
          className="btn btn--small search__help-btn"
          type="button"
          aria-expanded={help}
          aria-label="Search help"
          onClick={() => setHelp((h) => !h)}
        >
          ?
        </button>
        {sugg.length > 0 && (
          <ul className="search__suggestions textbox" id={`${listId}-list`} role="listbox">
            {sugg.map((s, i) => (
              <li key={s.id} role="option" aria-selected={highlight === i + 1}>
                <button
                  type="button"
                  className={highlight === i + 1 ? "is-active" : ""}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/pokemon/${s.id}`);
                  }}
                >
                  <SpriteImg set={tileSprites({ pid: s.id, anim: null }, game)} size={40} />
                  <span className="search__sugg-no">{dexNo(s.id)}</span>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {help && (
          <div className="search__help textbox" role="dialog" aria-label="Search syntax">
            <strong>SEARCH TIPS</strong>
            <dl>
              {HELP.map(([q, d]) => (
                <div key={q}>
                  <dt>{q}</dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
            <p>Combine anything: “fire kanto sort:bst”. Press Enter on an exact name or number to jump to its page.</p>
            <button className="btn btn--small" type="button" onClick={() => setHelp(false)}>
              CLOSE
            </button>
          </div>
        )}
      </form>

      <div className="search__filters">
        <label>
          <span>TYPE</span>
          <select value={typeValue} onChange={(e) => setFilter("type", e.target.value)}>
            <option value="">Any</option>
            {TYPE_IDS.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>GEN</span>
          <select value={genValue} onChange={(e) => setFilter("gen", e.target.value)}>
            <option value="">All</option>
            {Object.entries(GEN_REGION).map(([g, region]) => (
              <option key={g} value={g}>
                {romanGen(Number(g))} · {region}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>SORT</span>
          <select value={sortValue} onChange={(e) => setFilter("sort", e.target.value === "num" ? "" : e.target.value)}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k === "num" ? "" : k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
