import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type WorkoutSummary } from "../../api";
import { useApi, useOnFocus } from "../../hooks";
import { addDays, monthLabel, parseYmd, relTime, startOfMonth, startOfWeek, ymd } from "../../dates";
import { Icon } from "../../components/Icon";
import { Sheet, Spinner, toast } from "../../components/ui";
import { Chat } from "../../components/Chat";
import { ProgressView } from "../../components/ProgressView";
import { InviteShare, STAGES, type CrmRow, type Stage } from "./Clients";
import { EngagementRing } from "./Overview";
import { WeekBoard } from "./WeekBoard";

type PatientInfo = {
  id: string;
  name: string;
  email: string | null;
  diagnosis: string | null;
  goals: string | null;
  notes: string | null;
  invite_code: string | null;
  archived: number;
  stage: Stage;
  stage_changed_at: string;
  source: string | null;
  phone: string | null;
  monthly_rate: number | null;
  follow_up_on: string | null;
};

const TABS = ["board", "calendar", "messages", "progress", "profile"] as const;
type Tab = (typeof TABS)[number];

export function ClientDetail() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "board";
  const { data: p, reload } = useApi<PatientInfo>(`/patients/${id}`);
  // The client list is usually cached already, so the header paints before the full record arrives.
  const crm = useApi<CrmRow[]>("/crm");
  const row = crm.data?.find((r) => r.id === id);
  const head = p ?? row;
  const [inviting, setInviting] = useState(false);

  if (!head) return <Spinner />;
  return (
    <div className="client-detail">
      <Link to="/clients" className="row small" style={{ gap: 4, marginBottom: 8 }}>
        <Icon name="back" size={16} /> Clients
      </Link>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{head.name}</h1>
            <span className="chip brand">{STAGES.find((s) => s.id === head.stage)?.label}</span>
          </div>
          {head.diagnosis && <div className="muted">{head.diagnosis}</div>}
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {row && row.stage === "active" && (
            <div className="health" title="Engagement over the last two weeks">
              <EngagementRing value={row.engagement} />
              <div>
                <div className="small" style={{ fontWeight: 650 }}>
                  {row.scheduled_14d ? `${row.completed_14d} of ${row.scheduled_14d} done` : "Nothing scheduled"}
                  <span className="faint"> · 14 days</span>
                </div>
                <div className="tiny muted">
                  {row.last_active_at ? `Active ${relTime(row.last_active_at)}` : "Not active yet"}
                  {row.risk_reasons.length ? ` · ${row.risk_reasons.join(" · ")}` : ""}
                </div>
              </div>
            </div>
          )}
          {head.invite_code && (
            <button className="btn" onClick={() => setInviting(true)}>
              <Icon name="link" size={18} /> Invite link
            </button>
          )}
        </div>
      </div>

      <div className="segmented" style={{ marginBottom: 16, maxWidth: 600 }}>
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setParams({ tab: t }, { replace: true })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {!p ? (
        <Spinner />
      ) : (
        <>
          {tab === "board" && <WeekBoard patientId={p.id} />}
          {tab === "calendar" && <Calendar patientId={p.id} onPickDay={() => setParams({ tab: "board" })} />}
          {tab === "messages" && (
            <div style={{ maxWidth: 680 }}>
              <Chat patientId={p.id} inline />
            </div>
          )}
          {tab === "progress" && (
            <div style={{ maxWidth: 760 }}>
              <ProgressView patientId={p.id} />
            </div>
          )}
          {tab === "profile" && <Profile p={p} onSaved={reload} />}
        </>
      )}

      {inviting && head.invite_code && (
        <Sheet open onClose={() => setInviting(false)}>
          <InviteShare name={head.name} code={head.invite_code} onDone={() => setInviting(false)} />
        </Sheet>
      )}
    </div>
  );
}

function Calendar({ patientId, onPickDay }: { patientId: string; onPickDay: () => void }) {
  const nav = useNavigate();
  const [month, setMonth] = useState(startOfMonth(ymd()));
  const gridStart = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const { data, loading, reload } = useApi<WorkoutSummary[]>(
    `/workouts?patientId=${patientId}&from=${days[0]}&to=${days[41]}`,
  );
  useOnFocus(reload);
  const [dragging, setDragging] = useState<string | null>(null);
  const today = ymd();

  const move = async (workoutId: string, date: string) => {
    const w = data?.find((x) => x.id === workoutId);
    if (!w || w.scheduled_on === date) return;
    try {
      const full = await api.get<{ title: string; notes: string | null; items: { id: string; exercise_id: string; block: string; instructions: string | null }[] }>(`/workouts/${workoutId}`);
      await api.put(`/workouts/${workoutId}`, { ...full, scheduled_on: date, items: full.items });
      reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <button className="icon-btn" aria-label="Previous month" onClick={() => setMonth(startOfMonth(addDays(month, -1)))}>
          <Icon name="back" size={20} />
        </button>
        <h2>{monthLabel(month)}</h2>
        <button className="icon-btn" aria-label="Next month" onClick={() => setMonth(startOfMonth(addDays(month, 32)))}>
          <Icon name="chev" size={20} />
        </button>
      </div>
      {loading && !data && <Spinner />}
      <div className="cal">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="cal-head">{d}</div>
        ))}
        {days.map((d) => {
          const ws = (data ?? []).filter((w) => w.scheduled_on === d);
          return (
            <div
              key={d}
              className={`cal-cell${d.slice(0, 7) !== month.slice(0, 7) ? " other" : ""}${d === today ? " today" : ""}`}
              onClick={onPickDay}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) move(dragging, d);
                setDragging(null);
              }}
              title="Open the board to edit"
            >
              <div className="d">{parseYmd(d).getDate()}</div>
              {ws.map((w) => {
                const status = w.completed_at ? "done" : d < today ? "missed" : "";
                return (
                  <div
                    key={w.id}
                    className={`cal-w ${status}`}
                    draggable
                    onDragStart={() => setDragging(w.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      nav(`/workouts/${w.id}`);
                    }}
                    title={w.title}
                  >
                    {w.completed_at ? "✓ " : ""}
                    {w.title}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="small faint" style={{ marginTop: 8 }}>Drag a workout to move it. Click a day to edit on the board.</div>
    </div>
  );
}

function Profile({ p, onSaved }: { p: PatientInfo; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: p.name,
    diagnosis: p.diagnosis ?? "",
    goals: p.goals ?? "",
    notes: p.notes ?? "",
    stage: p.stage as string,
    source: p.source ?? "",
    phone: p.phone ?? "",
    monthly_rate: p.monthly_rate === null ? "" : String(p.monthly_rate),
    follow_up_on: p.follow_up_on ?? "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="card pad stack" style={{ maxWidth: 680 }}>
      <label className="field"><span>Name</span><input className="input" value={form.name} onChange={set("name")} /></label>
      <label className="field"><span>Diagnosis / focus</span><input className="input" value={form.diagnosis} onChange={set("diagnosis")} /></label>
      <label className="field"><span>Goals</span><textarea className="textarea" value={form.goals} onChange={set("goals")} /></label>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="field grow"><span>Stage</span>
          <select className="input" value={form.stage} onChange={set("stage")}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.hint})</option>)}
          </select>
        </label>
        <label className="field grow"><span>Follow up on</span><input className="input" type="date" value={form.follow_up_on} onChange={set("follow_up_on")} /></label>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="field grow"><span>Source</span><input className="input" value={form.source} onChange={set("source")} /></label>
        <label className="field grow"><span>Phone</span><input className="input" type="tel" value={form.phone} onChange={set("phone")} /></label>
        <label className="field" style={{ width: 130 }}><span>$/month</span><input className="input" inputMode="numeric" value={form.monthly_rate} onChange={set("monthly_rate")} /></label>
      </div>
      <label className="field"><span>Private notes (only you see these)</span><textarea className="textarea" value={form.notes} onChange={set("notes")} /></label>
      <div className="small faint">{p.email ? `Login: ${p.email}` : "Hasn't accepted the invite yet."}</div>
      <div className="row">
        <button
          className="btn primary"
          onClick={async () => {
            try {
              await api.patch(`/patients/${p.id}`, form);
              toast("Saved");
              onSaved();
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          Save
        </button>
        <button
          className="btn"
          onClick={async () => {
            await api.patch(`/patients/${p.id}`, { archived: !p.archived });
            onSaved();
          }}
        >
          {p.archived ? "Unarchive" : "Archive client"}
        </button>
        {!p.email && (
          <button
            className="btn ghost"
            onClick={async () => {
              await api.post(`/patients/${p.id}/invite`);
              toast("New invite link created");
              onSaved();
            }}
          >
            New invite link
          </button>
        )}
      </div>
    </div>
  );
}
