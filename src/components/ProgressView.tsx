import { useMemo } from "react";
import { useApi } from "../hooks";
import { addDays, parseYmd, startOfWeek, ymd } from "../dates";
import { LineChart, WeekBars } from "./Chart";
import { Icon } from "./Icon";
import { Spinner } from "./ui";

type Metrics = {
  workouts: { scheduled_on: string; completed_at: string | null; pain_before: number | null; pain_after: number | null }[];
  total_completed: number;
  streak: number;
};

function Stat({ value, label, icon }: { value: string | number; label: string; icon: string }) {
  return (
    <div className="card pad" style={{ padding: 14 }}>
      <div className="row" style={{ gap: 6, color: "var(--text-3)" }}>
        <Icon name={icon} size={16} />
        <span className="tiny" style={{ fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 750, marginTop: 4 }}>{value}</div>
    </div>
  );
}

/** Adherence and pain, derived from the workouts themselves. */
export function ProgressView({ patientId }: { patientId: string }) {
  const metrics = useApi<Metrics>(`/metrics?patientId=${patientId}`);

  const weeks = useMemo(() => {
    if (!metrics.data) return [];
    const map = new Map<string, { done: number; planned: number }>();
    for (const w of metrics.data.workouts) {
      const k = startOfWeek(w.scheduled_on);
      const v = map.get(k) ?? { done: 0, planned: 0 };
      v.planned++;
      if (w.completed_at) v.done++;
      map.set(k, v);
    }
    const start = startOfWeek(addDays(ymd(), -7 * 11));
    return Array.from({ length: 12 }, (_, i) => {
      const k = addDays(start, i * 7);
      const v = map.get(k) ?? { done: 0, planned: 0 };
      return { label: parseYmd(k).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }), ...v };
    });
  }, [metrics.data]);

  if (metrics.loading && !metrics.data) return <Spinner />;
  const m = metrics.data;
  const last28 = (m?.workouts ?? []).filter((w) => w.scheduled_on >= addDays(ymd(), -28) && w.scheduled_on <= ymd());
  const adherence = last28.length ? Math.round((last28.filter((w) => w.completed_at).length / last28.length) * 100) : null;
  const painAfter = (m?.workouts ?? []).filter((w) => w.pain_after !== null).map((w) => ({ date: w.scheduled_on, value: w.pain_after! }));

  return (
    <div className="stack">
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Stat value={m?.total_completed ?? 0} label="Workouts" icon="trophy" />
        <Stat value={m?.streak ?? 0} label="Streak" icon="flame" />
        <Stat value={adherence === null ? "–" : `${adherence}%`} label="28-day" icon="check" />
      </div>
      <div className="card pad">
        <h3>Pain after workouts</h3>
        <div className="small muted" style={{ marginBottom: 8 }}>0 is no pain, 10 is the worst.</div>
        <LineChart min={0} max={10} series={[{ label: "Pain after workout", color: "var(--text)", points: painAfter }]} />
      </div>
      <div className="card pad">
        <h3>Workouts per week</h3>
        <div className="small muted" style={{ marginBottom: 8 }}>Green is completed, grey is scheduled.</div>
        <WeekBars weeks={weeks} />
      </div>
    </div>
  );
}
