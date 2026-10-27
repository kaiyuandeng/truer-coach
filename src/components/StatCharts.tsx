import { histogram, quantile } from "../pages/coach/stats";

/** Small SVG charts for the coach overview. Ink for data, red and amber only for values past a threshold. */

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

export function TrendChart({
  series,
  band,
  target,
  min,
  max,
  fmt,
  labels,
  width = 420,
  height = 170,
}: {
  /** First series is drawn solid with its end value labelled; the rest are dashed for comparison. */
  series: (number | null)[][];
  band?: [number, number][];
  target?: number;
  min: number;
  max: number;
  fmt: (v: number) => string;
  labels: string[];
  width?: number;
  height?: number;
}) {
  const L = 38, R = 44, T = 12, B = 22;
  const x = lin(0, labels.length - 1, L, width - R);
  const y = lin(min, max, height - B, T);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + (max - min) * t);
  const path = (vals: (number | null)[]) =>
    vals.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const main = series[0] ?? [];
  const lastI = main.map((v, i) => (v === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
  return (
    <svg className="ch" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width * 1.25 }} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line className="gl" x1={L} x2={width - R} y1={y(t)} y2={y(t)} />
          <text x={L - 6} y={y(t) + 3} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      {labels.map((l, i) =>
        (labels.length - 1 - i) % 2 === 0 ? (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{l}</text>
        ) : null,
      )}
      {band && band.length > 1 && (
        <polygon
          className="band"
          points={[...band.map((b, i) => `${x(i)},${y(b[1])}`), ...band.map((b, i) => `${x(i)},${y(b[0])}`).reverse()].join(" ")}
        />
      )}
      {target !== undefined && (
        <>
          <line className="tgt" x1={L} x2={width - R} y1={y(target)} y2={y(target)} />
          <text className="tgt-l" x={L + 4} y={y(target) - 4}>target {fmt(target)}</text>
        </>
      )}
      {series.slice(1).map((s, i) => <polyline key={i} className="ln2" points={path(s)} />)}
      <polyline className="ln" points={path(main)} />
      {lastI >= 0 && (
        <>
          <circle className="end" cx={x(lastI)} cy={y(main[lastI]!)} r={3} />
          <text className="end-l" x={x(lastI) + 6} y={y(main[lastI]!) + 3}>{fmt(main[lastI]!)}</text>
        </>
      )}
      <line className="ax" x1={L} x2={width - R} y1={height - B} y2={height - B} />
    </svg>
  );
}

/** Clients per 10% adherence bin, with the median marked. */
export function AdherenceHistogram({ values, width = 360, height = 170 }: { values: number[]; width?: number; height?: number }) {
  const counts = histogram(values, 10);
  const L = 24, R = 8, T = 12, B = 22;
  const top = Math.max(1, ...counts);
  const bw = (width - L - R) / counts.length;
  const y = lin(0, top, height - B, T);
  const md = quantile(values, 0.5);
  const step = top > 8 ? Math.ceil(top / 4) : 1;
  return (
    <svg className="ch" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width * 1.25 }} role="img" aria-label="Clients by adherence">
      {Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step).map((t) => (
        <g key={t}>
          <line className="gl" x1={L} x2={width - R} y1={y(t)} y2={y(t)} />
          <text x={L - 5} y={y(t) + 3} textAnchor="end">{t}</text>
        </g>
      ))}
      {counts.map((n, i) => (
        <g key={i}>
          {n > 0 && <rect className={`bx${i < 5 ? " lo" : i < 7 ? " mid" : ""}`} x={L + i * bw + 2} y={y(n)} width={bw - 4} height={height - B - y(n)} />}
          {i % 2 === 0 && <text x={L + i * bw} y={height - 6} textAnchor="middle">{i * 10}</text>}
        </g>
      ))}
      <text x={width - R} y={height - 6} textAnchor="end">100%</text>
      {md !== null && (
        <>
          <line className="tgt" x1={L + md * (width - L - R)} x2={L + md * (width - L - R)} y1={T} y2={height - B} />
          <text className="tgt-l" x={L + md * (width - L - R) + (md > 0.7 ? -4 : 4)} y={T + 8} textAnchor={md > 0.7 ? "end" : "start"}>
            median {Math.round(md * 100)}%
          </text>
        </>
      )}
      <line className="ax" x1={L} x2={width - R} y1={height - B} y2={height - B} />
    </svg>
  );
}

export type ScatterPoint = { id: string; label: string; x: number; y: number; tone: "risk" | "nudge" | "" };

/** Adherence (x, 0–100%) against change in pain (y). Points past ±range are pinned to the edge. */
export function AdherenceScatter({
  points,
  selected,
  onPick,
  range = 2,
  width = 380,
  height = 220,
}: {
  points: ScatterPoint[];
  selected?: string | null;
  onPick?: (id: string) => void;
  range?: number;
  width?: number;
  height?: number;
}) {
  const L = 34, R = 10, T = 12, B = 26;
  const x = lin(0, 1, L, width - R);
  const y = lin(-range, range, height - B, T);
  const yt = [-range, -range / 2, 0, range / 2, range];
  const sel = points.find((p) => p.id === selected);
  const clampY = (v: number) => Math.max(-range, Math.min(range, v));
  return (
    <svg className="ch" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width * 1.25 }} role="img" aria-label="Adherence against change in pain">
      {yt.map((t) => (
        <g key={t}>
          <line className="gl" x1={L} x2={width - R} y1={y(t)} y2={y(t)} />
          <text x={L - 5} y={y(t) + 3} textAnchor="end">{t > 0 ? `+${t}` : t}</text>
        </g>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line className="gl" x1={x(t)} x2={x(t)} y1={T} y2={height - B} />
          <text x={x(t)} y={height - 10} textAnchor="middle">{t * 100}%</text>
        </g>
      ))}
      <line className="tgt" x1={x(0.8)} x2={x(0.8)} y1={T} y2={height - B} />
      <line className="ax" x1={L} x2={width - R} y1={y(0)} y2={y(0)} />
      <text x={width - R} y={T + 9} textAnchor="end">pain rising</text>
      <text x={width - R} y={height - B - 4} textAnchor="end">pain falling</text>
      {points.map((p) => (
        <circle
          key={p.id}
          className={`dot${p.tone === "risk" ? " r" : p.tone === "nudge" ? " w" : ""}${p.id === selected ? " on" : ""}`}
          cx={x(p.x)}
          cy={y(clampY(p.y))}
          r={5}
          onClick={onPick ? () => onPick(p.id) : undefined}
        >
          <title>{`${p.label}: ${Math.round(p.x * 100)}% adherence, pain ${p.y > 0 ? "+" : ""}${p.y.toFixed(1)}`}</title>
        </circle>
      ))}
      {sel && <text className="end-l" x={x(sel.x) + 8} y={y(clampY(sel.y)) + 3}>{sel.label}</text>}
    </svg>
  );
}
