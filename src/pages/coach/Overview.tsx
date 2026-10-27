import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, useOnFocus } from "../../hooks";
import { addDays, dayLabel, parseYmd } from "../../dates";
import { Grid, f1, pct, signed, type Col } from "../../components/Grid";
import { AdherenceHistogram, AdherenceScatter, TrendChart } from "../../components/StatCharts";
import { clientStats, mean, quantile, summarize, zScore, type ClientStats, type DayRow } from "./stats";
import type { CrmRow } from "./Clients";

type ClientExtra = { days: DayRow[]; waiting: number; latest: string | null; latest_at: string | null; next_on: string | null; last_on: string | null };
type OverviewData = { today: string; from: string; to: string; clients: Record<string, ClientExtra> };

type Status = "risk" | "nudge" | "track" | "new";
const STATUS: Record<Status, string> = { risk: "Needs you", nudge: "Nudge", track: "On track", new: "Starting" };
const RANK: Record<Status, number> = { risk: 0, nudge: 1, new: 2, track: 3 };

type Row = CrmRow & ClientExtra & ClientStats & { status: Status; z: number | null };

const EMPTY: ClientExtra = { days: [], waiting: 0, latest: null, latest_at: null, next_on: null, last_on: null };

function statusOf(r: CrmRow): Status {
  if (!r.last_active_at && r.invite_code) return "new";
  if (r.churn_risk === "high") return "risk";
  if (r.churn_risk === "medium") return "nudge";
  return "track";
}

const short = (d: string) => parseYmd(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * The coach's workbook front sheet: practice statistics (this fortnight against the last), one row per
 * active client with a day-by-day grid, and the charts that show how the practice is spread.
 */
export function Overview() {
  const nav = useNavigate();
  const crm = useApi<CrmRow[]>("/crm");
  const ov = useApi<OverviewData>("/overview");
  const [filter, setFilter] = useState<Status | "waiting" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useOnFocus(crm.reload);
  useOnFocus(ov.reload);

  const today = ov.data?.today ?? new Date().toISOString().slice(0, 10);

  const rows: Row[] = useMemo(() => {
    if (!crm.data) return [];
    const base = crm.data
      .filter((r) => r.stage === "active")
      .map((r) => {
        const extra = ov.data?.clients[r.id] ?? EMPTY;
        return { ...r, ...extra, ...clientStats(extra.days, today), status: statusOf(r), z: null as number | null };
      });
    const s = summarize(base.flatMap((r) => (r.adh14 === null ? [] : [r.adh14])));
    for (const r of base) r.z = zScore(r.adh14, s);
    return base.sort((a, b) => RANK[a.status] - RANK[b.status] || (a.adh14 ?? 2) - (b.adh14 ?? 2));
  }, [crm.data, ov.data, today]);

  const shown = rows.filter((r) => !filter || (filter === "waiting" ? r.waiting > 0 : r.status === filter));
  const followUps = (crm.data ?? []).filter((r) => r.stage !== "active" && r.stage !== "churned" && r.follow_up_on && r.follow_up_on <= today);
  const loading = !crm.data || !ov.data;
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const open = (id: string) => nav(`/clients/${id}`);

  return (
    <div className="ledger">
      <header className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="page-sub num">
            {parseYmd(today).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · last 14 days vs prior 14 · {rows.length} active
          </p>
        </div>
        <div className="seg" role="group" aria-label="Filter clients">
          {([[null, "All", rows.length], ["risk", "Needs you", count("risk")], ["nudge", "Nudge", count("nudge")], ["track", "On track", count("track")], ["waiting", "Waiting", rows.filter((r) => r.waiting).length]] as const).map(([k, l, n]) => (
            <button key={l} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l} <span className="num">{loading ? "–" : n}</span>
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="g-loading">Loading…</div>
      ) : !rows.length ? (
        <div className="g-loading">No active clients yet. Add one from the Clients sheet and send them their invite link.</div>
      ) : (
        <>
          <Section title="Practice statistics" hint="active clients · Δ is this 14 days minus the prior 14">
            <PracticeStats rows={rows} />
          </Section>

          <Section title="Clients × days" hint="red and amber cells are past a threshold · footer counts sessions done per day">
            <DayGrid rows={shown} today={today} onOpen={open} />
            <div className="legend">
              <span><i className="sq done" /> Done</span>
              <span><i className="sq missed" /> Missed</span>
              <span><i className="sq planned" /> Planned</span>
              <span><i className="sq" /> Rest</span>
            </div>
          </Section>

          <Charts rows={rows} today={today} picked={picked} onPick={(id) => (picked === id ? open(id) : setPicked(id))} />
        </>
      )}

      {followUps.length > 0 && (
        <Section title="Pipeline follow-ups due" hint={`${followUps.length} lead${followUps.length === 1 ? "" : "s"}`}>
          <Grid
            rows={followUps}
            rowKey={(r) => r.id}
            onRowClick={(r) => nav(`/clients/${r.id}?tab=profile`)}
            cols={[
              { key: "name", label: "Name", render: (r) => r.name, sort: (r) => r.name },
              { key: "stage", label: "Stage", render: (r) => (r.stage === "lead" ? "Lead" : r.stage === "consult" ? "Onboarding" : "Paused"), sort: (r) => r.stage },
              { key: "src", label: "Source", render: (r) => r.source ?? "", sort: (r) => r.source },
              { key: "due", label: "Follow up", render: (r) => dayLabel(r.follow_up_on!), sort: (r) => r.follow_up_on, tone: (r) => (r.follow_up_on! < today ? "bad" : "") },
            ]}
          />
        </Section>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="g-section">
      <div className="g-title">{title} {hint && <span>{hint}</span>}</div>
      {children}
    </section>
  );
}

type StatRow = { key: string; label: string; cur: number[]; prev: number[] | null; fmt: (v: number | null) => string; dfmt: (v: number | null) => string; worse: 1 | -1 };

function PracticeStats({ rows }: { rows: Row[] }) {
  const vals = (f: (r: Row) => number | null) => rows.flatMap((r) => { const v = f(r); return v === null ? [] : [v]; });
  const stats: StatRow[] = [
    { key: "adh", label: "Adherence, 14 days", cur: vals((r) => r.adh14), prev: vals((r) => r.adhPrev), fmt: pct, dfmt: (v) => (v === null ? "–" : `${signed(v * 100, 0)} pt`), worse: -1 },
    { key: "pain", label: "Pain after session (0–10)", cur: vals((r) => r.pain14), prev: vals((r) => r.painPrev), fmt: f1, dfmt: signed, worse: 1 },
    { key: "eng", label: "Engagement score", cur: vals((r) => r.engagement), prev: null, fmt: (v) => (v === null ? "–" : String(Math.round(v))), dfmt: () => "–", worse: -1 },
    { key: "quiet", label: "Days since last session", cur: vals((r) => r.days_quiet), prev: null, fmt: (v) => (v === null ? "–" : `${f1(v)} d`), dfmt: () => "–", worse: 1 },
    { key: "wait", label: "Unanswered per client", cur: rows.map((r) => r.waiting), prev: null, fmt: f1, dfmt: () => "–", worse: 1 },
  ];
  const delta = (s: StatRow) => (s.prev ? (mean(s.cur) ?? NaN) - (mean(s.prev) ?? NaN) : null);
  const d = (s: StatRow) => { const v = delta(s); return v === null || Number.isNaN(v) ? null : v; };
  const cols: Col<StatRow>[] = [
    { key: "m", label: "Metric", render: (s) => s.label },
    { key: "mean", label: "Mean", num: true, render: (s) => s.fmt(mean(s.cur)) },
    { key: "prev", label: "Prior 14 d", num: true, render: (s) => (s.prev ? s.fmt(mean(s.prev)) : "–") },
    { key: "d", label: "Δ", num: true, render: (s) => s.dfmt(d(s)), tone: (s) => { const v = d(s); const big = s.key === "adh" ? 0.05 : 0.3; return v !== null && v * s.worse > big ? "bad" : ""; } },
    { key: "med", label: "Median", num: true, render: (s) => s.fmt(quantile(s.cur, 0.5)) },
    { key: "p25", label: "P25", num: true, render: (s) => s.fmt(quantile(s.cur, 0.25)) },
    { key: "p75", label: "P75", num: true, render: (s) => s.fmt(quantile(s.cur, 0.75)) },
    { key: "sd", label: "SD", num: true, render: (s) => { const v = summarize(s.cur).sd; return s.key === "adh" ? (v === null ? "–" : `${Math.round(v * 100)} pt`) : f1(v); } },
    { key: "n", label: "n", num: true, render: (s) => s.cur.length },
  ];
  return <Grid rows={stats} cols={cols} rowKey={(s) => s.key} />;
}

function DayGrid({ rows, today, onOpen }: { rows: Row[]; today: string; onOpen: (id: string) => void }) {
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, i - 14));
  const cell = (r: Row, d: string) => {
    const x = r.days.find((y) => y.date === d);
    if (!x || !x.planned) return { state: "rest", x };
    return { state: x.done >= x.planned ? "done" : d < today ? "missed" : "planned", x };
  };
  const cols: Col<Row>[] = [
    { key: "name", label: "Client", render: (r) => <span className="g-name">{r.name}</span>, sort: (r) => r.name },
    { key: "status", label: "Status", render: (r) => <span className={`tag s-${r.status}`}>{STATUS[r.status]}</span>, sort: (r) => RANK[r.status] },
    { key: "adh", label: "Adh 14d", num: true, title: "Sessions done ÷ planned, last 14 days", render: (r) => pct(r.adh14), sort: (r) => r.adh14, tone: (r) => (r.adh14 === null ? "" : r.adh14 < 0.5 ? "bad" : r.adh14 < 0.7 ? "meh" : "") },
    { key: "dp", label: "Done", num: true, render: (r) => (r.planned14 ? `${r.done14}/${r.planned14}` : "–"), sort: (r) => r.done14 },
    { key: "z", label: "z", num: true, title: "Adherence against the practice mean, in standard deviations", render: (r) => signed(r.z), sort: (r) => r.z, tone: (r) => (r.z !== null && r.z < -1.5 ? "bad" : "") },
    { key: "pain", label: "Pain", num: true, title: "Average pain after sessions, last 14 days", render: (r) => f1(r.pain14), sort: (r) => r.pain14, tone: (r) => (r.pain14 !== null && r.pain14 >= 7 ? "bad" : "") },
    { key: "dpain", label: "ΔPain", num: true, title: "Change against the prior 14 days", render: (r) => signed(r.dPain), sort: (r) => r.dPain, tone: (r) => (r.dPain === null ? "" : r.dPain >= 1 ? "bad" : r.dPain >= 0.5 ? "meh" : "") },
    { key: "quiet", label: "Quiet", num: true, title: "Days since last activity", render: (r) => (r.days_quiet === null ? "–" : `${r.days_quiet}d`), sort: (r) => r.days_quiet, tone: (r) => (r.days_quiet === null ? "" : r.days_quiet >= 5 ? "bad" : r.days_quiet >= 3 ? "meh" : "") },
    { key: "wait", label: "Wait", num: true, title: "Comments and messages waiting on your reply", render: (r) => r.waiting || "", sort: (r) => r.waiting, tone: (r) => (r.waiting >= 2 ? "meh" : "") },
    ...days.map((d): Col<Row> => {
      const dt = parseYmd(d);
      return {
        key: d,
        label: <>{dt.toLocaleDateString(undefined, { weekday: "narrow" })}<br />{dt.getDate()}</>,
        className: `g-day${d === today ? " g-today" : ""}`,
        title: dayLabel(d),
        render: (r) => {
          const { state, x } = cell(r, d);
          return <i className={`sq ${state}`} title={`${short(d)}: ${state}${x?.pain_after != null ? `, pain ${x.pain_after}/10` : ""}`} />;
        },
      };
    }),
  ];
  const nums = (f: (r: Row) => number | null) => rows.flatMap((r) => { const v = f(r); return v === null ? [] : [v]; });
  const foot: ReactNode[] = [
    `${rows.length} clients`,
    "",
    pct(mean(nums((r) => r.adh14))),
    `${rows.reduce((s, r) => s + r.done14, 0)}/${rows.reduce((s, r) => s + r.planned14, 0)}`,
    "",
    f1(mean(nums((r) => r.pain14))),
    signed(mean(nums((r) => r.dPain))),
    (() => { const m = quantile(nums((r) => r.days_quiet), 0.5); return m === null ? "–" : `${Math.round(m)}d`; })(),
    rows.reduce((s, r) => s + r.waiting, 0) || "",
    ...days.map((d) => {
      const cs = rows.map((r) => cell(r, d)).filter((c) => c.state !== "rest");
      if (!cs.length) return "";
      return d < today ? cs.filter((c) => c.state === "done").length : cs.length;
    }),
  ];
  return <Grid rows={rows} cols={cols} rowKey={(r) => r.id} onRowClick={(r) => onOpen(r.id)} foot={foot} empty="No clients in this group." />;
}

function Charts({ rows, today, picked, onPick }: { rows: Row[]; today: string; picked: string | null; onPick: (id: string) => void }) {
  const nWeeks = rows[0]?.weeks.length ?? 8;
  const labels = Array.from({ length: nWeeks }, (_, i) => short(addDays(today, -7 * (nWeeks - i))));
  const weekly = Array.from({ length: nWeeks }, (_, i) => {
    const v = rows.flatMap((r) => (r.weeks[i]?.adherence == null ? [] : [r.weeks[i].adherence!]));
    return { m: mean(v), lo: quantile(v, 0.25), hi: quantile(v, 0.75) };
  });
  const pain = Array.from({ length: nWeeks }, (_, i) => mean(rows.flatMap((r) => (r.weeks[i]?.pain == null ? [] : [r.weeks[i].pain!]))));
  const adh = rows.flatMap((r) => (r.adh14 === null ? [] : [r.adh14]));
  const pts = rows.flatMap((r) => (r.adh14 === null || r.dPain === null ? [] : [{ id: r.id, label: r.name.split(" ")[0], x: r.adh14, y: r.dPain, tone: r.status === "risk" ? "risk" as const : r.status === "nudge" ? "nudge" as const : "" as const }]));
  const band = weekly.every((w) => w.lo !== null && w.hi !== null) ? weekly.map((w) => [w.lo!, w.hi!] as [number, number]) : undefined;
  return (
    <div className="g-charts">
      <figure className="g-panel">
        <figcaption><b>Weekly adherence</b><span>mean · band is P25–P75</span></figcaption>
        <TrendChart series={[weekly.map((w) => w.m)]} band={band} target={0.8} min={0} max={1} fmt={(v) => `${Math.round(v * 100)}%`} labels={labels} width={380} />
      </figure>
      <figure className="g-panel">
        <figcaption><b>Average pain after sessions</b><span>0–10 · lower is better</span></figcaption>
        <TrendChart series={[pain]} min={0} max={10} fmt={(v) => v.toFixed(v % 1 ? 1 : 0)} labels={labels} width={380} />
      </figure>
      <figure className="g-panel">
        <figcaption><b>Adherence distribution</b><span>clients per 10% · n = {adh.length}</span></figcaption>
        <AdherenceHistogram values={adh} />
      </figure>
      <figure className="g-panel">
        <figcaption><b>Adherence vs Δ pain</b><span>{pts.length ? "click a dot, click again to open" : "needs two weeks of pain scores"}</span></figcaption>
        <AdherenceScatter points={pts} selected={picked} onPick={onPick} />
      </figure>
    </div>
  );
}

export function EngagementRing({ value }: { value: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const color = value >= 45 ? "var(--text)" : "var(--danger)";
  return (
    <div className="cc-ring" title={`Engagement ${value}/100`}>
      <svg viewBox="0 0 40 40" width="40" height="40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${(c * value) / 100} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      <span>{value}</span>
    </div>
  );
}
