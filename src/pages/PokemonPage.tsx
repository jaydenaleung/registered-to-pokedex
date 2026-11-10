import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CardViewer } from "../components/CardViewer";
import { CatchButton } from "../components/CatchLog";
import { EvolutionTree } from "../components/EvolutionTree";
import { MoveTable } from "../components/MoveTable";
import { playCry, PokeballReveal } from "../components/PokeballReveal";
import { ProfessorNotes } from "../components/ProfessorNotes";
import { StatBars } from "../components/StatBars";
import { VoteButtons } from "../components/VoteButtons";
import { dexNo, Img, Loading, Tag, TypeBadge, useGhost } from "../components/basics";
import { ageYears, debutYear, regionFor, romanGen } from "../lib/age";
import { catchScenarios, catchTier, formatPercent } from "../lib/catchRate";
import { prefetchDetail, useDetail, useForms, useTypes } from "../lib/data";
import { useGame } from "../lib/session";
import { formMon, originalSprite, speciesMon } from "../lib/sprites";
import { defensiveProfile } from "../lib/typeChart";
import type { FormSummary, SpeciesDetail, SpeciesSummary } from "../lib/types";

interface Props {
  species: SpeciesSummary;
  /** Selected alternate form (PokeAPI pokemon id), or null for the default form. */
  formPid: number | null;
}

const KIND_ORDER = { regional: 0, mega: 1, primal: 2, gmax: 3, other: 4 } as const;

/** Everything a page needs about the species *as currently shown* (default or alternate form). */
function useEntry(species: SpeciesSummary, formPid: number | null) {
  const { data: forms } = useForms();
  const { data: detail, error } = useDetail(species.id);
  return useMemo(() => {
    const speciesForms = (forms ?? [])
      .filter((f) => f.species === species.id)
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.pid - b.pid);
    const form = formPid ? (speciesForms.find((f) => f.pid === formPid) ?? null) : null;
    const formDetail = form ? detail?.forms?.find((f) => f.pid === form.pid) : undefined;
    return {
      mon: form ? formMon(form) : speciesMon(species),
      form,
      speciesForms,
      detail,
      error,
      abilities: formDetail?.abilities ?? detail?.abilities,
      moves: formDetail?.moves ?? detail?.moves ?? null,
      cards: formDetail?.cards.length ? formDetail.cards : (detail?.cards ?? []),
    };
  }, [forms, detail, error, species, formPid]);
}

function FormSwitcher({ species, forms, current, defaultLabel }: { species: SpeciesSummary; forms: FormSummary[]; current: number | null; defaultLabel: string }) {
  const navigate = useNavigate();
  const ghost = useGhost();
  if (!forms.length) return null;
  const go = (pid: number | null) => !ghost && navigate(`/pokemon/${species.id}${pid ? `?form=${pid}` : ""}`, { replace: true });
  return (
    <div className="forms" role="group" aria-label="Forms">
      <span className="forms__label">FORMS</span>
      <button type="button" className={`forms__chip${current === null ? " is-on" : ""}`} aria-pressed={current === null} onClick={() => go(null)}>
        {defaultLabel}
      </button>
      {forms.map((f) => (
        <button
          key={f.pid}
          type="button"
          className={`forms__chip forms__chip--${f.kind}${current === f.pid ? " is-on" : ""}`}
          aria-pressed={current === f.pid}
          onClick={() => go(f.pid)}
          title={f.name}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ left page

export function PokemonLeft({ species, formPid }: Props) {
  const ghost = useGhost();
  const game = useGame();
  const { mon, form, speciesForms, detail, error, cards } = useEntry(species, formPid);
  const [playKey, setPlayKey] = useState(0);
  const original = !game && !form ? originalSprite(species.id) : null;

  useEffect(() => {
    if (ghost) return;
    prefetchDetail(species.id + 1);
    prefetchDetail(species.id - 1);
  }, [species.id, ghost]);

  return (
    <div className="mon-page">
      <header className="title-strip">
        <span className="title-strip__no">{dexNo(species.id)}</span>
        <h1 className="title-strip__name">{mon.name.toUpperCase()}</h1>
        <span className="title-strip__genus">{species.genus}</span>
      </header>

      <FormSwitcher species={species} forms={speciesForms} current={form?.pid ?? null} defaultLabel={detail?.formLabel ?? species.name} />

      <PokeballReveal mon={mon} playKey={playKey} />
      <div className="arena-controls">
        <button type="button" className="btn btn--small" onClick={() => setPlayKey((k) => k + 1)} title="Throw the ball again">
          THROW AGAIN
        </button>
        <button type="button" className="btn btn--small" onClick={() => playCry(mon.pid, game)} title="Play its cry">
          CRY
        </button>
        <Link className="btn btn--small btn--blue" to={`/battle?p=${mon.pid}`} title="Battle with this Pokémon (beta)">
          BATTLE β
        </Link>
        {original && (
          <span className="original-sprite" title="Original 1996 Red/Blue sprite">
            <Img sources={[original]} alt={`${species.name} original Red/Blue sprite`} width={56} height={56} />
            <small>RED/BLUE</small>
          </span>
        )}
      </div>

      {error ? (
        <p className="body-text">Couldn't load this entry.</p>
      ) : detail ? (
        <CardViewer key={mon.pid} species={species} cards={cards} pid={mon.pid} name={mon.name} />
      ) : (
        <Loading />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ right page

const TABS = ["LORE", "STATS", "MOVES", "EVOLUTION"] as const;
type TabName = (typeof TABS)[number];

function genderText(rate: number) {
  if (rate < 0) return "Genderless";
  const female = (rate / 8) * 100;
  if (female === 0) return "♂ 100%";
  if (female === 100) return "♀ 100%";
  return `♂ ${100 - female}% · ♀ ${female}%`;
}

interface TagCloudProps {
  species: SpeciesSummary;
  detail: SpeciesDetail | undefined;
  form: FormSummary | null;
  view: { types: string[]; height: number; weight: number; abilities: SpeciesDetail["abilities"] | undefined };
}

function TagCloud({ species, detail, form, view }: TagCloudProps) {
  const { data: types } = useTypes();
  const profile = types ? defensiveProfile(view.types, types.chart) : null;
  const tier = catchTier(species.capture);
  const year = debutYear(species.id, species.gen);
  const klass = species.mythical ? "MYTHICAL" : species.legendary ? "LEGENDARY" : species.baby ? "BABY" : "REGULAR";

  return (
    <div className="tag-cloud">
      <Tag label="TYPE">
        {view.types.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
      </Tag>
      {form && (
        <Tag label="FORM" tone={form.kind === "mega" || form.kind === "primal" ? "gold" : undefined}>
          {form.label.toUpperCase()}
          {form.battleOnly ? <small>(in battle only)</small> : null}
        </Tag>
      )}
      <Tag label="GEN">
        {romanGen(species.gen)} · {regionFor(species.id, species.gen).toUpperCase()}
      </Tag>
      <Tag label="AGE">
        {ageYears(species.id, species.gen)} YRS <small>(since {year})</small>
      </Tag>
      <Tag label="CLASS" tone={klass === "MYTHICAL" ? "pink" : klass === "LEGENDARY" ? "gold" : undefined}>
        {klass}
      </Tag>
      <Tag label="CATCH">
        <span className={`catch-meter catch-meter--${tier.level}`} aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} className={i < tier.level ? "on" : ""} />
          ))}
        </span>
        {tier.label.toUpperCase()} <small>({species.capture}/255)</small>
      </Tag>
      <Tag label="HT / WT">
        {(view.height / 10).toFixed(1)} m · {(view.weight / 10).toFixed(1)} kg
      </Tag>
      {profile && (profile.quad.length > 0 || profile.double.length > 0) && (
        <Tag label="WEAK">
          {profile.quad.map((t) => (
            <TypeBadge key={t} type={t} small suffix="×4" />
          ))}
          {profile.double.map((t) => (
            <TypeBadge key={t} type={t} small suffix="×2" />
          ))}
        </Tag>
      )}
      {profile && (profile.half.length > 0 || profile.quarter.length > 0) && (
        <Tag label="RESISTS" tone="dim">
          {profile.quarter.map((t) => (
            <TypeBadge key={t} type={t} small suffix="×¼" />
          ))}
          {profile.half.map((t) => (
            <TypeBadge key={t} type={t} small suffix="×½" />
          ))}
        </Tag>
      )}
      {profile && profile.immune.length > 0 && (
        <Tag label="IMMUNE" tone="dim">
          {profile.immune.map((t) => (
            <TypeBadge key={t} type={t} small suffix="×0" />
          ))}
        </Tag>
      )}
      {detail && (
        <>
          <Tag label="ABILITIES">
            {(view.abilities ?? detail.abilities).map((a) => (
              <span key={a.name} className="chip" title={a.description}>
                {a.name}
                {a.hidden ? <em> (H)</em> : null}
              </span>
            ))}
          </Tag>
          <Tag label="EGG GROUPS">{detail.eggGroups.join(" · ") || "—"}</Tag>
          <Tag label="GENDER">{genderText(detail.genderRate)}</Tag>
          {detail.habitat && <Tag label="HABITAT">{detail.habitat.toUpperCase()}</Tag>}
          {detail.color && <Tag label="COLOR">{detail.color.toUpperCase()}</Tag>}
          {detail.shape && <Tag label="SHAPE">{detail.shape.toUpperCase()}</Tag>}
          {detail.growthRate && <Tag label="GROWTH">{detail.growthRate.toUpperCase()}</Tag>}
        </>
      )}
    </div>
  );
}

function CatchOdds({ capture }: { capture: number }) {
  const odds = catchScenarios(capture);
  return (
    <div className="odds">
      <h3 className="section-title">CATCH ODDS</h3>
      <p className="body-text">
        Poké Ball at full HP: <b>{formatPercent(odds.pokeBallFullHp)}</b> per throw (≈ {Math.ceil(odds.expectedBalls)} balls).
      </p>
      <p className="body-text">
        Ultra Ball, 1 HP, asleep: <b>{formatPercent(odds.ultraBallOneHpAsleep)}</b> per throw.
      </p>
      <p className="body-text dim small">Gen V+ formula, ignoring critical captures and level bonuses.</p>
    </div>
  );
}

export function PokemonRight({ species, formPid }: Props) {
  const { mon, form, detail, error, abilities, moves } = useEntry(species, formPid);
  const game = useGame();
  const [tab, setTab] = useState<TabName>("LORE");
  const [allEntries, setAllEntries] = useState(false);
  // In a game mode, that game's own Pokédex entries come first.
  const flavor = useMemo(() => {
    if (!detail) return [];
    if (!game) return detail.flavor.map((f) => ({ ...f, thisGame: false }));
    const mark = detail.flavor.map((f) => ({ ...f, thisGame: f.games.some((g) => game.versions.includes(g)) }));
    return [...mark.filter((f) => f.thisGame), ...mark.filter((f) => !f.thisGame)];
  }, [detail, game]);
  const entries = allEntries ? flavor : flavor.slice(0, 5);

  return (
    <div className="mon-page mon-page--right">
      <TagCloud
        species={species}
        detail={detail}
        form={form}
        view={{ types: mon.types, height: mon.height, weight: mon.weight, abilities }}
      />
      <div className="action-row">
        <VoteButtons dexId={species.id} name={species.name} />
        <CatchButton species={species} />
      </div>

      <div className="tabs" role="tablist" aria-label="Entry sections">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            className={`tabs__tab${tab === t ? " is-on" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {error && <p className="body-text">Couldn't load this entry.</p>}
        {!detail && !error && <Loading />}
        {detail && tab === "LORE" && (
          <div className="lore">
            <ProfessorNotes dexId={species.id} name={species.name} />
            <h3 className="section-title">POKéDEX ENTRIES</h3>
            {detail.flavor.length ? (
              <ul className="dex-entries">
                {entries.map((f, i) => (
                  <li key={i} className={f.thisGame ? "is-this-game" : undefined}>
                    <span className="dex-entries__games">
                      {f.thisGame && <b>THIS GAME · </b>}
                      {f.games.slice(0, 4).join(" · ")}
                    </span>
                    <p className="body-text">{f.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="body-text dim">No Pokédex entries yet.</p>
            )}
            {flavor.length > 5 && (
              <button type="button" className="btn btn--small" onClick={() => setAllEntries(!allEntries)}>
                {allEntries ? "SHOW FEWER" : `SHOW ALL ${flavor.length} ENTRIES`}
              </button>
            )}
          </div>
        )}
        {detail && tab === "STATS" && (
          <div>
            <h3 className="section-title">BASE STATS</h3>
            <StatBars stats={mon.stats} />
            <CatchOdds capture={species.capture} />
            <h3 className="section-title">ABILITIES</h3>
            <dl className="abilities">
              {(abilities ?? detail.abilities).map((a) => (
                <div key={a.name}>
                  <dt>
                    {a.name}
                    {a.hidden && <em> · HIDDEN</em>}
                  </dt>
                  <dd className="body-text">{a.description}</dd>
                </div>
              ))}
            </dl>
            <p className="body-text dim small">
              Hatch: {detail.hatchCounter ?? "?"} egg cycles · Base friendship: {detail.baseHappiness ?? "?"}
            </p>
          </div>
        )}
        {detail && tab === "MOVES" && <MoveTable learnset={moves} />}
        {detail && tab === "EVOLUTION" && <EvolutionTree tree={detail.evolution} current={species.id} />}
      </div>
    </div>
  );
}
