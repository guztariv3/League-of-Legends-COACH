/** Small, dependency-free statistics helpers. */

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

export function variance(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Wilson score interval for a proportion (95% by default). */
export function wilson(successes: number, n: number, z = 1.96): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export interface MeanComparison {
  a: number;
  b: number;
  diff: number;
  /** Welch's t statistic; NaN when there is not enough data. */
  t: number;
  /** |t| ≥ 2 with at least `minN` samples per side (≈95% two-sided for moderate n). */
  consolidated: boolean;
}

/**
 * Compares two samples. A change is only "consolidated" when both samples are
 * large enough and the difference clears Welch's t ≥ 2, so ordinary variance is
 * not reported as a real change.
 */
export function compareMeans(a: number[], b: number[], minN = 8): MeanComparison {
  const ma = mean(a);
  const mb = mean(b);
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  const t = se > 0 ? (ma - mb) / se : NaN;
  return {
    a: ma,
    b: mb,
    diff: ma - mb,
    t,
    consolidated: a.length >= minN && b.length >= minN && Number.isFinite(t) && Math.abs(t) >= 2,
  };
}

/** Confidence contributed by sample size and data completeness (0..1). ≈0.56 at 10 samples, ≈0.92 at 30. */
export function sampleConfidence(n: number, completeness = 1): number {
  return (1 - Math.exp(-n / 12)) * (0.4 + 0.6 * Math.max(0, Math.min(1, completeness)));
}

/** Two-proportion z statistic (pooled). NaN when either side is empty. */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number {
  if (!n1 || !n2) return NaN;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : NaN;
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}
