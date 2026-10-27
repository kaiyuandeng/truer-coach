import { parseYmd } from "../dates";

type Point = { date: string; value: number };

const W = 600;
const H = 180;
const PAD = { l: 28, r: 8, t: 10, b: 22 };

function shortDate(s: string) {
  return parseYmd(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Simple time-series line chart. `series` share the x axis (dates). */
export function LineChart({
  series,
  min,
  max,
  height = H,
}: {
  series: { label: string; color: string; points: Point[] }[];
  min?: number;
  max?: number;
  height?: number;
}) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <div className="faint small center" style={{ padding: 24 }}>No data yet</div>;
  const times = all.map((p) => parseYmd(p.date).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const vals = all.map((p) => p.value);
  const lo = min ?? Math.min(...vals);
  const hi = max ?? Math.max(...vals);
  const span = hi - lo || 1;
  const x = (d: string) => PAD.l + ((parseYmd(d).getTime() - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (height - PAD.t - PAD.b);
  const ticks = [lo, lo + span / 2, hi];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">
              {Math.round(t * 10) / 10}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={height - 4}>{shortDate(all.reduce((a, b) => (a.date < b.date ? a : b)).date)}</text>
        <text x={W - PAD.r} y={height - 4} textAnchor="end">
          {shortDate(all.reduce((a, b) => (a.date > b.date ? a : b)).date)}
        </text>
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => (a.date < b.date ? -1 : 1));
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {pts.length <= 40 &&
                pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={3.5} fill={s.color} />)}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="row small" style={{ gap: 16, marginTop: 6, justifyContent: "center" }}>
          {series.map((s) => (
            <span key={s.label} className="row" style={{ gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Weekly completion bars: done / planned. */
export function WeekBars({ weeks }: { weeks: { label: string; done: number; planned: number }[] }) {
  if (!weeks.length) return <div className="faint small center" style={{ padding: 24 }}>No workouts yet</div>;
  const maxPlanned = Math.max(1, ...weeks.map((w) => w.planned));
  const bw = (W - PAD.l - PAD.r) / weeks.length;
  const h = 150;
  const y = (v: number) => PAD.t + (1 - v / maxPlanned) * (h - PAD.t - PAD.b);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label="Workouts completed per week">
        {weeks.map((w, i) => (
          <g key={w.label}>
            <rect x={PAD.l + i * bw + bw * 0.18} width={bw * 0.64} y={y(w.planned)} height={h - PAD.b - y(w.planned)} rx={4} fill="var(--surface-2)" />
            <rect x={PAD.l + i * bw + bw * 0.18} width={bw * 0.64} y={y(w.done)} height={h - PAD.b - y(w.done)} rx={4} fill="var(--accent)" />
            {(i === 0 || i === weeks.length - 1 || weeks.length <= 8) && (
              <text x={PAD.l + i * bw + bw / 2} y={h - 6} textAnchor="middle">
                {w.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
