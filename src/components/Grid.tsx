import { useState, type ReactNode } from "react";

/** Conditional formatting for a cell: "bad" crosses a threshold, "meh" is a warning. */
export type Tone = "bad" | "meh" | "";

export type Col<T> = {
  key: string;
  label: ReactNode;
  render: (r: T) => ReactNode;
  /** Sort value. Columns without one are not sortable. Nulls sort last either way. */
  sort?: (r: T) => number | string | null;
  num?: boolean;
  tone?: (r: T) => Tone;
  title?: string;
  className?: string;
};

/**
 * A spreadsheet-style table: row numbers, sortable headers, conditional formatting and an
 * optional totals row. Click a header to sort, click again to reverse.
 */
export function Grid<T>({
  rows,
  cols,
  rowKey,
  onRowClick,
  selected,
  foot,
  initialSort,
  rowNumbers = true,
  empty,
}: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  selected?: string | null;
  foot?: ReactNode[];
  initialSort?: { key: string; dir: 1 | -1 };
  rowNumbers?: boolean;
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const col = sort && cols.find((c) => c.key === sort.key);
  const shown = col?.sort
    ? [...rows].sort((a, b) => {
        const va = col.sort!(a);
        const vb = col.sort!(b);
        if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort!.dir;
      })
    : rows;
  const toggle = (key: string) => setSort(sort?.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 });

  return (
    <div className="grid-scroll">
      <table className="g">
        <thead>
          <tr>
            {rowNumbers && <th className="rn" aria-hidden />}
            {cols.map((c) => (
              <th
                key={c.key}
                className={[c.num && "n", c.sort && "sortable", c.className].filter(Boolean).join(" ")}
                title={c.title}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                tabIndex={c.sort ? 0 : undefined}
                onClick={c.sort ? () => toggle(c.key) : undefined}
                onKeyDown={c.sort ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(c.key)) : undefined}
              >
                {c.label}
                {sort?.key === c.key && <span className="ar">{sort.dir === 1 ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => {
            const k = rowKey(r);
            return (
              <tr
                key={k}
                className={[onRowClick && "click", selected === k && "on"].filter(Boolean).join(" ")}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {rowNumbers && <td className="rn">{i + 1}</td>}
                {cols.map((c) => (
                  <td key={c.key} className={[c.num && "n", c.tone?.(r), c.className].filter(Boolean).join(" ")}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
          {!shown.length && empty && (
            <tr>
              <td colSpan={cols.length + (rowNumbers ? 1 : 0)} className="g-empty">{empty}</td>
            </tr>
          )}
        </tbody>
        {foot && shown.length > 0 && (
          <tfoot>
            <tr>
              {rowNumbers && <td className="rn">Σ</td>}
              {foot.map((f, i) => (
                <td key={i} className={[cols[i]?.num && "n", cols[i]?.className].filter(Boolean).join(" ")}>{f}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
export const f1 = (v: number | null) => (v === null ? "–" : v.toFixed(1));
/** Signed number with a real minus sign, e.g. +0.4 / −1.2 / ±0.0. */
export function signed(v: number | null, digits = 1) {
  if (v === null) return "–";
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toFixed(digits)}`;
}
