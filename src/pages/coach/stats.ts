/**
 * Pure statistics for the coach overview (no runtime imports, so the tests can load it directly).
 * Dates are YYYY-MM-DD strings, which sort and compare correctly as plain strings.
 */

export type DayRow = { date: string; planned: number; done: number; pain_after: number | null };

export type Summary = { n: number; mean: number | null; median: number | null; p25: number | null; p75: number | null; sd: number | null };

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/** Linear-interpolated quantile, p in [0, 1]. */
export function quantile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** Population standard deviation. */
export function sd(xs: number[]): number | null {
  const m = mean(xs);
  if (m === null) return null;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

export function summarize(xs: number[]): Summary {
  return { n: xs.length, mean: mean(xs), median: quantile(xs, 0.5), p25: quantile(xs, 0.25), p75: quantile(xs, 0.75), sd: sd(xs) };
}

/** Least-squares slope of ys against their index; null values are skipped but keep their position. */
export function slope(ys: (number | null)[]): number | null {
  const pts = ys.flatMap((y, x) => (y === null ? [] : [[x, y] as const]));
  if (pts.length < 2) return null;
  const mx = mean(pts.map((p) => p[0]))!;
  const my = mean(pts.map((p) => p[1]))!;
  const den = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return den ? pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / den : null;
}

export function shift(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Sessions done ÷ sessions planned on days in [from, to]. Null when nothing was planned. */
export function adherence(days: DayRow[], from: string, to: string): { done: number; planned: number; rate: number | null } {
  let done = 0;
  let planned = 0;
  for (const d of days) {
    if (d.date < from || d.date > to) continue;
    done += Math.min(d.done, d.planned);
    planned += d.planned;
  }
  return { done, planned, rate: planned ? done / planned : null };
}

export function painMean(days: DayRow[], from: string, to: string): number | null {
  return mean(days.filter((d) => d.date >= from && d.date <= to && d.pain_after !== null).map((d) => d.pain_after!));
}

export type ClientStats = {
  adh14: number | null;
  adhPrev: number | null;
  done14: number;
  planned14: number;
  pain14: number | null;
  painPrev: number | null;
  dPain: number | null;
  /** Oldest first; each week ends the day before today, so the last entry is the most recent seven days. */
  weeks: { start: string; adherence: number | null; pain: number | null }[];
  painSlope: number | null;
};

/**
 * Per-client numbers from their day rows. "Last 14 days" ends yesterday, because today's session
 * may simply not have happened yet; the prior window is the 14 days before that.
 */
export function clientStats(days: DayRow[], today: string, nWeeks = 8): ClientStats {
  const end = shift(today, -1);
  const cur = adherence(days, shift(today, -14), end);
  const prev = adherence(days, shift(today, -28), shift(today, -15));
  const pain14 = painMean(days, shift(today, -14), end);
  const painPrev = painMean(days, shift(today, -28), shift(today, -15));
  const weeks = Array.from({ length: nWeeks }, (_, i) => {
    const start = shift(today, -7 * (nWeeks - i));
    const stop = shift(start, 6);
    return { start, adherence: adherence(days, start, stop).rate, pain: painMean(days, start, stop) };
  });
  return {
    adh14: cur.rate,
    adhPrev: prev.rate,
    done14: cur.done,
    planned14: cur.planned,
    pain14,
    painPrev,
    dPain: pain14 !== null && painPrev !== null ? pain14 - painPrev : null,
    weeks,
    painSlope: slope(weeks.map((w) => w.pain)),
  };
}

/** Standard score of x against the group; null when the group has no spread. */
export function zScore(x: number | null, s: Summary): number | null {
  if (x === null || s.mean === null || !s.sd) return null;
  return (x - s.mean) / s.sd;
}

/** Counts per bin of width 1/bins over [0, 1]; 1.0 lands in the last bin. */
export function histogram(xs: number[], bins = 10): number[] {
  const out = new Array(bins).fill(0);
  for (const x of xs) out[Math.min(bins - 1, Math.max(0, Math.floor(x * bins)))]++;
  return out;
}
