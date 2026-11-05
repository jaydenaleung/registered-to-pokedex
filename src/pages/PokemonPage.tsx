import { useEffect, useState } from "react";
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
import { prefetchDetail, useDetail, useTypes } from "../lib/data";
import { originalSprite } from "../lib/sprites";
import { defensiveProfile } from "../lib/typeChart";
import type { SpeciesDetail, SpeciesSummary } from "../lib/types";

interface Props {
  species: SpeciesSummary;
}

// ------------------------------------------------------------------ left page

export function PokemonLeft({ species }: Props) {
  const ghost = useGhost();
  const { data: detail, error } = useDetail(species.id);
  const [playKey, setPlayKey] = useState(0);
  const original = originalSprite(species.id);

  useEffect(() => {
    if (ghost) return;
    prefetchDetail(species.id + 1);
    prefetchDetail(species.id - 1);
  }, [species.id, ghost]);

  return (
    <div className="mon-page">
      <header className="title-strip">
        <span className="title-strip__no">{dexNo(species.id)}</span>
        <h1 className="title-strip__name">{species.name.toUpperCase()}</h1>
        <span className="title-strip__genus">{species.genus}</span>
      </header>

      <PokeballReveal species={species} playKey={playKey} />
      <div className="arena-controls">
        <button type="button" className="btn btn--small" onClick={() => setPlayKey((k) => k + 1)} title="Throw the ball again">
          THROW AGAIN
        </button>
        <button type="button" className="btn btn--small" onClick={() => playCry(species.id)} title="Play its cry">
          CRY
        </button>
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
        <CardViewer species={species} cards={detail.cards} />
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

function TagCloud({ species, detail }: { species: SpeciesSummary; detail: SpeciesDetail | undefined }) {
  const { data: types } = useTypes();
  const profile = types ? defensiveProfile(species.types, types.chart) : null;
  const tier = catchTier(species.capture);
  const year = debutYear(species.id, species.gen);
  const klass = species.mythical ? "MYTHICAL" : species.legendary ? "LEGENDARY" : species.baby ? "BABY" : "REGULAR";

  return (
    <div className="tag-cloud">
      <Tag label="TYPE">
        {species.types.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
      </Tag>
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
        {(species.height / 10).toFixed(1)} m · {(species.weight / 10).toFixed(1)} kg
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
            {detail.abilities.map((a) => (
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

export function PokemonRight({ species }: Props) {
  const { data: detail, error } = useDetail(species.id);
  const [tab, setTab] = useState<TabName>("LORE");
  const [allEntries, setAllEntries] = useState(false);
  const entries = detail ? (allEntries ? detail.flavor : detail.flavor.slice(0, 5)) : [];

  return (
    <div className="mon-page mon-page--right">
      <TagCloud species={species} detail={detail} />
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
                  <li key={i}>
                    <span className="dex-entries__games">{f.games.slice(0, 4).join(" · ")}</span>
                    <p className="body-text">{f.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="body-text dim">No Pokédex entries yet.</p>
            )}
            {detail.flavor.length > 5 && (
              <button type="button" className="btn btn--small" onClick={() => setAllEntries(!allEntries)}>
                {allEntries ? "SHOW FEWER" : `SHOW ALL ${detail.flavor.length} ENTRIES`}
              </button>
            )}
          </div>
        )}
        {detail && tab === "STATS" && (
          <div>
            <h3 className="section-title">BASE STATS</h3>
            <StatBars stats={species.stats} />
            <CatchOdds capture={species.capture} />
            <h3 className="section-title">ABILITIES</h3>
            <dl className="abilities">
              {detail.abilities.map((a) => (
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
        {detail && tab === "MOVES" && <MoveTable learnset={detail.moves} />}
        {detail && tab === "EVOLUTION" && <EvolutionTree tree={detail.evolution} current={species.id} />}
      </div>
    </div>
  );
}
