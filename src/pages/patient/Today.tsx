import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { WorkoutSummary } from "../../api";
import { addDays, dayLabel, greeting, parseYmd, startOfWeek, ymd } from "../../dates";
import { useApi, useOnFocus } from "../../hooks";
import { useSession } from "../../session";
import { Icon } from "../../components/Icon";
import { Empty, Spinner } from "../../components/ui";
import { labelItems } from "../../blocks";

export function Ring({ done, total, size = 64 }: { done: number; total: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 25%)" strokeWidth={7} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="label">{total ? `${done}/${total}` : "–"}</div>
    </div>
  );
}

export function WorkoutCard({ w, to }: { w: WorkoutSummary; to: string }) {
  const items = labelItems(w.items);
  const done = items.filter((i) => i.done).length;
  const missed = !w.completed_at && w.scheduled_on < ymd();
  return (
    <Link to={to} className="card" style={{ display: "block", color: "inherit", overflow: "hidden" }}>
      <div className="row between" style={{ padding: "12px 16px", background: "var(--surface-2)" }}>
        <div className="small" style={{ fontWeight: 650 }}>{dayLabel(w.scheduled_on, { long: true })}</div>
        {w.completed_at ? (
          <span className="chip accent"><Icon name="check" size={14} /> Done</span>
        ) : missed ? (
          <span className="chip danger">Missed</span>
        ) : done ? (
          <span className="chip brand">{done}/{items.length}</span>
        ) : null}
      </div>
      <div style={{ padding: "12px 16px 14px" }}>
        <h3>{w.title}</h3>
        <div className="small muted" style={{ marginTop: 6 }}>
          {items.slice(0, 4).map((i) => (
            <div key={i.id} className="row" style={{ gap: 8, padding: "3px 0" }}>
              <span className="chip" style={{ padding: "1px 7px", fontSize: 12, minWidth: 30, justifyContent: "center" }}>{i.label}</span>
              <span className="ellipsis" style={i.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{i.name}</span>
            </div>
          ))}
          {items.length > 4 && <div className="faint" style={{ paddingTop: 4 }}>+{items.length - 4} more</div>}
        </div>
      </div>
    </Link>
  );
}

export function Today() {
  const { me } = useSession();
  const nav = useNavigate();
  const today = ymd();
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const [selected, setSelected] = useState(today);
  const range = useMemo(() => ({ from: addDays(today, -120), to: addDays(today, 60) }), [today]);
  const { data, loading, reload } = useApi<WorkoutSummary[]>(`/workouts?from=${range.from}&to=${range.to}`);
  useOnFocus(reload);

  const byDate = useMemo(() => {
    const m = new Map<string, WorkoutSummary[]>();
    for (const w of data ?? []) m.set(w.scheduled_on, [...(m.get(w.scheduled_on) ?? []), w]);
    return m;
  }, [data]);

  const todays = byDate.get(today) ?? [];
  const focus = todays.find((w) => !w.completed_at) ?? todays[0];
  const focusDone = focus ? focus.items.filter((i) => i.done).length : 0;
  const weekStart = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const upcoming = (data ?? []).filter((w) => w.scheduled_on > today || (w.scheduled_on === today && w !== focus));
  const past = (data ?? []).filter((w) => w.scheduled_on < today).reverse();
  const selectedList = selected === today ? null : byDate.get(selected) ?? [];

  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div>
          <div className="muted small">{parseYmd(today).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1>{greeting()}, {me.name.split(" ")[0]}</h1>
        </div>
      </div>

      <div className="card pad" style={{ marginBottom: 16, padding: "10px 8px" }}>
        <div className="week">
          {week.map((d) => {
            const ws = byDate.get(d) ?? [];
            const status = !ws.length ? "" : ws.every((w) => w.completed_at) ? "done" : d < today ? "missed" : "planned";
            return (
              <button
                key={d}
                className={`day${d === today ? " today" : ""}${d === selected ? " selected" : ""}`}
                onClick={() => setSelected(d)}
                aria-label={dayLabel(d, { long: true })}
              >
                <span className="dow">{parseYmd(d).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                <span className="num">{parseYmd(d).getDate()}</span>
                <span className={`dot ${status}`} />
              </button>
            );
          })}
        </div>
      </div>

      {loading && !data ? (
        <Spinner />
      ) : selectedList ? (
        <div className="stack">
          <div className="row between">
            <h2>{dayLabel(selected, { long: true })}</h2>
            <button className="btn sm ghost" onClick={() => setSelected(today)}>Back to today</button>
          </div>
          {selectedList.length ? (
            selectedList.map((w) => <WorkoutCard key={w.id} w={w} to={`/workout/${w.id}`} />)
          ) : (
            <Empty icon="calendar" title="Rest day">Nothing scheduled for this day.</Empty>
          )}
        </div>
      ) : (
        <>
          {focus ? (
            <div className="hero" style={{ marginBottom: 20 }}>
              <div className="row" style={{ gap: 16, alignItems: "center" }}>
                <div className="grow">
                  <div className="muted small" style={{ fontWeight: 600 }}>
                    {focus.completed_at ? "Done for today" : "Today's workout"}
                  </div>
                  <h2 style={{ fontSize: 22, marginTop: 2 }}>{focus.title}</h2>
                  <div className="muted small" style={{ marginTop: 4 }}>{focus.items.length} exercises</div>
                </div>
                <Ring done={focusDone} total={focus.items.length} />
              </div>
              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                {focus.completed_at ? (
                  <button className="btn block" onClick={() => nav(`/workout/${focus.id}`)}>
                    Review workout
                  </button>
                ) : (
                  <button className="btn block" onClick={() => nav(`/workout/${focus.id}`)}>
                    {focusDone ? "Continue workout" : "Start workout"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="card pad" style={{ marginBottom: 20 }}>
              <Empty icon="calendar" title="No workout today">
                {me.therapist_name ? `${me.therapist_name} hasn't scheduled anything for today. Enjoy the rest.` : "Enjoy the rest."}
              </Empty>
            </div>
          )}

          <div className="segmented" style={{ marginBottom: 12 }}>
            <button className={view === "upcoming" ? "on" : ""} onClick={() => setView("upcoming")}>Upcoming</button>
            <button className={view === "past" ? "on" : ""} onClick={() => setView("past")}>Past</button>
          </div>
          <div className="stack">
            {(view === "upcoming" ? upcoming : past).map((w) => (
              <WorkoutCard key={w.id} w={w} to={`/workout/${w.id}`} />
            ))}
            {(view === "upcoming" ? upcoming : past).length === 0 && (
              <div className="faint small center" style={{ padding: 20 }}>
                {view === "upcoming" ? "Nothing else scheduled yet." : "No past workouts yet."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
