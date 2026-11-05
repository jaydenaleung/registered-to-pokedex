/**
 * Catch difficulty (INSTRUCTIONS.md §5.4).
 *
 * a = ((3·Hmax − 2·Hcur) · R · B) / (3·Hmax) · S,   p = min(1, (a / 255)^(3/4))
 * (Gen V+ shake-check approximation; ignores critical captures and level modifiers.)
 */

export interface CatchTier {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
}

const TIERS: { min: number; tier: CatchTier }[] = [
  { min: 150, tier: { level: 1, label: "Very Easy" } },
  { min: 76, tier: { level: 2, label: "Easy" } },
  { min: 46, tier: { level: 3, label: "Moderate" } },
  { min: 26, tier: { level: 4, label: "Hard" } },
  { min: 4, tier: { level: 5, label: "Very Hard" } },
  { min: 0, tier: { level: 6, label: "Extreme" } },
];

export function catchTier(captureRate: number): CatchTier {
  return (TIERS.find((t) => captureRate >= t.min) ?? TIERS[TIERS.length - 1]).tier;
}

export interface CatchConditions {
  /** Ball multiplier B (Poké Ball 1, Great 1.5, Ultra 2). */
  ball?: number;
  /** Status multiplier S (none 1, paralysis/poison/burn 1.5, sleep/freeze 2.5). */
  status?: number;
  /** Current HP as a fraction of max HP, in (0, 1]. */
  hpFraction?: number;
}

export function catchChance(captureRate: number, { ball = 1, status = 1, hpFraction = 1 }: CatchConditions = {}): number {
  const f = Math.min(1, Math.max(0, hpFraction));
  const a = ((3 - 2 * f) / 3) * captureRate * ball * status;
  if (a >= 255) return 1;
  return Math.min(1, Math.pow(a / 255, 3 / 4));
}

/** The two scenarios shown on every page. */
export function catchScenarios(captureRate: number) {
  const easy = catchChance(captureRate);
  const best = catchChance(captureRate, { ball: 2, status: 2.5, hpFraction: 0 });
  return {
    pokeBallFullHp: easy,
    expectedBalls: easy > 0 ? 1 / easy : Infinity,
    ultraBallOneHpAsleep: best,
  };
}

export function formatPercent(p: number): string {
  if (p >= 0.995) return "100%";
  if (p >= 0.1) return `${Math.round(p * 100)}%`;
  return `${(p * 100).toFixed(1)}%`;
}
