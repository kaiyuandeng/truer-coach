import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type PatientRow } from "../../api";
import { useApi } from "../../hooks";
import { startOfWeek, addDays, ymd } from "../../dates";
import { Icon } from "../../components/Icon";
import { Sheet, Spinner, toast } from "../../components/ui";
import { ExerciseBank, endDrag, readDrag } from "../../components/board";
import { useCoachLibrary } from "./library";
import type { Program } from "./Library";

type Cell = string | null; // template id

/** Lay saved workouts out over weeks, then schedule the whole thing for a client in one go. */
export function ProgramEditor() {
  const { id = "new" } = useParams();
  const nav = useNavigate();
  const isNew = id === "new";
  const { exercises, templates } = useCoachLibrary();
  const programs = useApi<Program[]>(isNew ? null : "/programs");
  const [form, setForm] = useState({ name: "", description: "", weeks: 4, days_per_week: 3 });
  const [grid, setGrid] = useState<Cell[][]>(() => Array.from({ length: 4 }, () => Array(3).fill(null)));
  const [over, setOver] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const p = programs.data?.find((x) => x.id === id);
    if (!p) return;
    setForm({ name: p.name, description: p.description ?? "", weeks: p.weeks, days_per_week: p.days_per_week });
    setGrid(Array.from({ length: p.weeks }, (_, w) => Array.from({ length: p.days_per_week }, (_, d) => p.days.find((x) => x.week === w + 1 && x.day === d + 1)?.template_id ?? null)));
  }, [programs.data, id]);

  const resize = (weeks: number, dpw: number) => {
    setForm((f) => ({ ...f, weeks, days_per_week: dpw }));
    setGrid((g) => Array.from({ length: weeks }, (_, w) => Array.from({ length: dpw }, (_, d) => g[w]?.[d] ?? null)));
    setDirty(true);
  };
  const setCell = (w: number, d: number, v: Cell) => {
    setGrid((g) => g.map((row, wi) => (wi === w ? row.map((c, di) => (di === d ? v : c)) : row)));
    setDirty(true);
  };

  const save = async () => {
    const days = grid.flatMap((row, w) => row.map((t, d) => (t ? { week: w + 1, day: d + 1, template_id: t } : null)).filter(Boolean));
    try {
      const payload = { ...form, days };
      if (isNew) {
        const r = await api.post<{ id: string }>("/programs", payload);
        nav(`/programs/${r.id}`, { replace: true });
      } else await api.put(`/programs/${id}`, payload);
      setDirty(false);
      toast("Saved");
      programs.reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  if (!isNew && !programs.data) return <Spinner />;
  const tName = (tid: string) => templates?.find((t) => t.id === tid)?.name ?? "…";

  return (
    <div>
      <Link to="/library?tab=programs" className="row small" style={{ gap: 4, marginBottom: 8 }}>
        <Icon name="back" size={16} /> Programs
      </Link>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <h1>{isNew ? "New program" : form.name}</h1>
        <div className="row">
          {!isNew && (
            <>
              <button className="btn danger" onClick={async () => { if (confirm("Delete this program? Scheduled workouts stay on calendars.")) { await api.del(`/programs/${id}`); nav("/library?tab=programs"); } }}>
                <Icon name="trash" size={18} />
              </button>
              <button className="btn" disabled={dirty} title={dirty ? "Save first" : undefined} onClick={() => setAssigning(true)}><Icon name="calendar" size={18} /> Assign to client</button>
            </>
          )}
          <button className="btn primary" disabled={!form.name.trim() || (!dirty && !isNew)} onClick={save}>{dirty || isNew ? "Save" : "Saved"}</button>
        </div>
      </div>

      <div className="board-shell">
        <div className="bank-panel">
          {exercises && templates ? <ExerciseBank exercises={[]} templates={templates} workoutsOnly /> : <Spinner />}
          <div className="tiny faint" style={{ marginTop: 8 }}>Drag saved workouts into the grid, or pick from each cell.</div>
        </div>
        <div className="stack">
          <div className="card pad stack">
            <div className="row" style={{ flexWrap: "wrap" }}>
              <label className="field grow"><span>Name</span><input className="input" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setDirty(true); }} placeholder="e.g. Phase 15" /></label>
              <label className="field" style={{ width: 110 }}><span>Weeks</span><input className="input" type="number" min={1} max={16} value={form.weeks} onChange={(e) => resize(Math.max(1, Math.min(16, Number(e.target.value) || 1)), form.days_per_week)} /></label>
              <label className="field" style={{ width: 130 }}><span>Days / week</span><input className="input" type="number" min={1} max={7} value={form.days_per_week} onChange={(e) => resize(form.weeks, Math.max(1, Math.min(7, Number(e.target.value) || 1)))} /></label>
            </div>
            <label className="field"><span>Description</span><input className="input" value={form.description} onChange={(e) => { setForm({ ...form, description: e.target.value }); setDirty(true); }} /></label>
          </div>
          <div className="card pad" style={{ overflowX: "auto" }}>
            <table className="table prog-grid">
              <thead>
                <tr>
                  <th />
                  {Array.from({ length: form.days_per_week }, (_, d) => <th key={d}>Day {d + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, w) => (
                  <tr key={w}>
                    <th style={{ whiteSpace: "nowrap" }}>Week {w + 1}</th>
                    {row.map((cell, d) => (
                      <td
                        key={d}
                        className={over === `${w}-${d}` ? "drag-over" : ""}
                        onDragOver={(e) => { e.preventDefault(); setOver(`${w}-${d}`); }}
                        onDragLeave={() => setOver(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setOver(null);
                          const p = readDrag(e);
                          endDrag();
                          if (p?.kind === "template") setCell(w, d, p.templateId);
                        }}
                      >
                        <select className="input" style={{ padding: "8px 10px", fontSize: 14 }} value={cell ?? ""} onChange={(e) => setCell(w, d, e.target.value || null)}>
                          <option value="">Rest / empty</option>
                          {(templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.folder ? `${t.folder} · ` : ""}{t.name}</option>)}
                        </select>
                        {cell && <div className="tiny faint" style={{ marginTop: 4 }}>{templates?.find((t) => t.id === cell)?.items.length ?? 0} exercises</div>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {w1Copy()}
          </div>
        </div>
      </div>
      {assigning && <AssignProgram programId={id} name={form.name} daysPerWeek={form.days_per_week} preview={(w, d) => (grid[w - 1]?.[d - 1] ? tName(grid[w - 1][d - 1]!) : null)} onClose={() => setAssigning(false)} />}
    </div>
  );

  // A quick way to fill a phase: repeat week 1 into every other week.
  function w1Copy() {
    if (form.weeks < 2 || !grid[0]?.some(Boolean)) return null;
    return (
      <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => { setGrid((g) => g.map(() => [...g[0]])); setDirty(true); }}>
        <Icon name="copy" size={14} /> Repeat week 1 in every week
      </button>
    );
  }
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW = [1, 2, 3, 4, 5, 6, 0]; // JS getDay values in Monday-first order

function AssignProgram({ programId, name, daysPerWeek, preview, onClose }: { programId: string; name: string; daysPerWeek: number; preview: (w: number, d: number) => string | null; onClose: () => void }) {
  const { data: patients } = useApi<PatientRow[]>("/patients");
  const nav = useNavigate();
  const [patientId, setPatientId] = useState("");
  const [start, setStart] = useState(addDays(startOfWeek(ymd()), 7));
  const [days, setDays] = useState<number[]>(() => [1, 3, 5, 2, 4, 6, 0].slice(0, daysPerWeek).sort((a, b) => DOW.indexOf(a) - DOW.indexOf(b)));
  const toggle = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => DOW.indexOf(a) - DOW.indexOf(b))));
  const assign = async () => {
    try {
      const r = await api.post<{ created: number }>(`/programs/${programId}/assign`, { patientId, startDate: start, weekdays: days });
      toast(`Scheduled ${r.created} workouts`);
      nav(`/clients/${patientId}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <div className="stack">
        <h2>Assign {name}</h2>
        <label className="field">
          <span>Client</span>
          <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Choose a client…</option>
            {(patients ?? []).filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Start date</span><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <div className="field">
          <span>Training days ({days.length} of {daysPerWeek})</span>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {DOW.map((d, i) => (
              <button key={d} className={`btn sm${days.includes(d) ? " primary" : ""}`} onClick={() => toggle(d)}>{WEEKDAYS[i]}</button>
            ))}
          </div>
        </div>
        <div className="small muted">
          Week 1: {days.map((d, i) => `${WEEKDAYS[DOW.indexOf(d)]} – ${preview(1, i + 1) ?? "rest"}`).join(", ")}
        </div>
        <button className="btn primary block" disabled={!patientId || days.length !== daysPerWeek} onClick={assign}>Schedule program</button>
      </div>
    </Sheet>
  );
}
