import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { useApi } from "../../hooks";
import { dayLabel, relTime } from "../../dates";
import { Icon } from "../../components/Icon";
import { Empty, Spinner, painColor, toast } from "../../components/ui";
import type { Template } from "./library";

export type Program = {
  id: string;
  name: string;
  description: string | null;
  weeks: number;
  days_per_week: number;
  patients_assigned: number;
  created_at: string;
  days: { week: number; day: number; template_id: string; template_name: string; item_count: number }[];
};

type HistoryRow = {
  id: string;
  title: string;
  scheduled_on: string;
  completed_at: string | null;
  pain_after: number | null;
  template_id: string | null;
  patient_id: string;
  patient_name: string;
  exercise_names: string | null;
  item_count: number;
};

const TABS = ["workouts", "programs", "history"] as const;

/** The coach's workout CRM: reusable workouts, multi-week programs, and everything ever built. */
export function Library() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as (typeof TABS)[number]) : "workouts";
  const nav = useNavigate();
  return (
    <div>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <h1>Workouts</h1>
        <div className="row">
          {tab === "programs" ? (
            <button className="btn primary" onClick={() => nav("/programs/new")}><Icon name="plus" size={18} /> New program</button>
          ) : (
            <button className="btn primary" onClick={() => nav("/templates/new")}><Icon name="plus" size={18} /> New workout</button>
          )}
        </div>
      </div>
      <div className="segmented" style={{ marginBottom: 16, maxWidth: 480 }}>
        <button className={tab === "workouts" ? "on" : ""} onClick={() => setParams({ tab: "workouts" }, { replace: true })}>Saved workouts</button>
        <button className={tab === "programs" ? "on" : ""} onClick={() => setParams({ tab: "programs" }, { replace: true })}>Programs</button>
        <button className={tab === "history" ? "on" : ""} onClick={() => setParams({ tab: "history" }, { replace: true })}>History</button>
      </div>
      {tab === "workouts" && <Templates />}
      {tab === "programs" && <Programs />}
      {tab === "history" && <History />}
    </div>
  );
}

function Templates() {
  const { data, loading } = useApi<Template[]>("/templates");
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const filtered = (data ?? []).filter((t) =>
      !q || `${t.name} ${t.folder ?? ""} ${t.tags ?? ""} ${t.items.map((i) => i.name).join(" ")}`.toLowerCase().includes(q.toLowerCase()),
    );
    const m = new Map<string, Template[]>();
    for (const t of filtered) m.set(t.folder ?? "Unfiled", [...(m.get(t.folder ?? "Unfiled") ?? []), t]);
    return [...m.entries()];
  }, [data, q]);
  if (loading && !data) return <Spinner />;
  return (
    <div>
      <input className="input" placeholder="Search by name, folder, tag or exercise" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420, marginBottom: 8 }} />
      {!groups.length && <div className="card pad"><Empty icon="library" title="No saved workouts">Build one here, or save any workout from a client's board.</Empty></div>}
      {groups.map(([folder, list]) => (
        <div key={folder}>
          <div className="section-title">{folder}</div>
          <div className="grid three">
            {list.map((t) => (
              <Link key={t.id} to={`/templates/${t.id}`} className="card pad" style={{ color: "inherit", display: "block" }}>
                <div className="row between">
                  <h3 className="ellipsis">{t.name}</h3>
                  <span className="chip">{t.items.length}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {t.items.map((i) => i.name).join(" · ")}
                </div>
                <div className="row tiny faint" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                  <span>Used {t.times_assigned}×</span>
                  {t.last_assigned_on && <span>Last {dayLabel(t.last_assigned_on).toLowerCase()}</span>}
                  {t.tags?.split(",").filter(Boolean).map((tag) => <span key={tag} className="chip" style={{ fontSize: 11, padding: "0 7px" }}>{tag.trim()}</span>)}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Programs() {
  const { data, loading } = useApi<Program[]>("/programs");
  if (loading && !data) return <Spinner />;
  if (!data?.length) return <div className="card pad"><Empty icon="calendar" title="No programs yet">A program lays saved workouts out over weeks, like "Phase 14: Week 1 Day 1…".</Empty></div>;
  return (
    <div className="grid two">
      {data.map((p) => (
        <Link key={p.id} to={`/programs/${p.id}`} className="card pad" style={{ color: "inherit", display: "block" }}>
          <div className="row between">
            <h3>{p.name}</h3>
            <span className="chip brand">{p.weeks} wk · {p.days_per_week}/wk</span>
          </div>
          {p.description && <div className="small muted" style={{ marginTop: 4 }}>{p.description}</div>}
          <div className="prog-mini" style={{ gridTemplateColumns: `repeat(${p.days_per_week}, 1fr)` }}>
            {Array.from({ length: p.weeks * p.days_per_week }, (_, i) => {
              const week = Math.floor(i / p.days_per_week) + 1;
              const day = (i % p.days_per_week) + 1;
              const d = p.days.find((x) => x.week === week && x.day === day);
              return <div key={i} className={`prog-cell${d ? "" : " empty"}`} title={d ? `Week ${week} Day ${day}: ${d.template_name}` : "Empty"}>{d?.template_name ?? "—"}</div>;
            })}
          </div>
          <div className="tiny faint" style={{ marginTop: 8 }}>Assigned to {p.patients_assigned} client{p.patients_assigned === 1 ? "" : "s"}</div>
        </Link>
      ))}
    </div>
  );
}

function History() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, loading } = useApi<HistoryRow[]>(`/history?q=${encodeURIComponent(query)}`);
  const nav = useNavigate();
  return (
    <div>
      <form
        className="row"
        style={{ maxWidth: 520, marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q);
        }}
      >
        <input className="input" placeholder="Search every workout by title, exercise or client" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn"><Icon name="search" size={18} /></button>
      </form>
      {loading && !data ? (
        <Spinner />
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Workout</th><th>Client</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {(data ?? []).map((w) => (
                <tr key={w.id} className="click" onClick={() => nav(`/workouts/${w.id}`)}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>{dayLabel(w.scheduled_on)}</td>
                  <td>
                    <div style={{ fontWeight: 650 }}>{w.title}</div>
                    <div className="tiny faint ellipsis" style={{ maxWidth: 420 }}>{w.exercise_names}</div>
                  </td>
                  <td className="small">{w.patient_name}</td>
                  <td>
                    {w.completed_at ? (
                      <span className="chip accent">Done {relTime(w.completed_at)}</span>
                    ) : w.scheduled_on < new Date().toISOString().slice(0, 10) ? (
                      <span className="chip danger">Missed</span>
                    ) : (
                      <span className="chip">Scheduled</span>
                    )}
                    {w.pain_after !== null && <span className="chip" style={{ background: painColor(w.pain_after), color: "#fff", marginLeft: 4 }}>{w.pain_after}</span>}
                  </td>
                  <td>
                    <button
                      className="btn sm"
                      title="Save as a reusable workout"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await api.post("/templates", { fromWorkoutId: w.id });
                        toast(`Saved "${w.title}" to your workouts`);
                      }}
                    >
                      <Icon name="library" size={16} /> Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.length === 0 && <div className="faint center" style={{ padding: 24 }}>No workouts match.</div>}
        </div>
      )}
    </div>
  );
}
