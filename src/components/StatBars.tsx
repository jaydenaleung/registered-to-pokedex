const LABELS = ["HP", "ATK", "DEF", "SPA", "SPD", "SPE"];

function tone(v: number) {
  if (v >= 120) return "great";
  if (v >= 90) return "good";
  if (v >= 60) return "ok";
  return "low";
}

export function StatBars({ stats, compact = false }: { stats: number[]; compact?: boolean }) {
  const total = stats.reduce((a, b) => a + b, 0);
  return (
    <div className={`stats${compact ? " stats--compact" : ""}`}>
      {stats.map((v, i) => (
        <div className="stats__row" key={LABELS[i]}>
          <span className="stats__label">{LABELS[i]}</span>
          <span className="stats__value">{v}</span>
          <span className="stats__track" aria-hidden="true">
            <span className={`stats__bar stats__bar--${tone(v)}`} style={{ width: `${Math.min(100, (v / 255) * 100)}%` }} />
          </span>
        </div>
      ))}
      <div className="stats__row stats__row--total">
        <span className="stats__label">BST</span>
        <span className="stats__value">{total}</span>
        <span />
      </div>
    </div>
  );
}
