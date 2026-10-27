import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type PatientRow } from "../../api";
import { useApi } from "../../hooks";
import { addDays, ymd } from "../../dates";
import { Icon } from "../../components/Icon";
import { Sheet, Spinner, toast } from "../../components/ui";
import { ExerciseBank, ItemList, fromExercise, toDraft, toPayload, type DraftItem } from "../../components/board";
import { useCoachLibrary } from "./library";

/** Build or edit a reusable workout. */
export function TemplateEditor() {
  const { id = "new" } = useParams();
  const nav = useNavigate();
  const { exercises, templates } = useCoachLibrary();
  const [form, setForm] = useState({ name: "", folder: "", tags: "", notes: "" });
  const [items, setItems] = useState<DraftItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const isNew = id === "new";

  useEffect(() => {
    if (isNew || !templates) return;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setForm({ name: t.name, folder: t.folder ?? "", tags: t.tags ?? "", notes: t.notes ?? "" });
    setItems(toDraft(t.items));
  }, [id, isNew, templates]);

  if (!isNew && !templates) return <Spinner />;
  const folders = [...new Set((templates ?? []).map((t) => t.folder).filter(Boolean))] as string[];

  const save = async () => {
    try {
      const payload = { ...form, items: toPayload(items) };
      if (isNew) {
        const r = await api.post<{ id: string }>("/templates", payload);
        nav(`/templates/${r.id}`, { replace: true });
      } else await api.put(`/templates/${id}`, payload);
      setDirty(false);
      toast("Saved");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm({ ...form, [k]: e.target.value });
    setDirty(true);
  };

  return (
    <div>
      <Link to="/library" className="row small" style={{ gap: 4, marginBottom: 8 }}>
        <Icon name="back" size={16} /> Workouts
      </Link>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <h1>{isNew ? "New workout" : form.name || "Workout"}</h1>
        <div className="row">
          {!isNew && (
            <>
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm("Delete this saved workout? Workouts already on clients' calendars stay.")) return;
                  try {
                    await api.del(`/templates/${id}`);
                    nav("/library");
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                <Icon name="trash" size={18} />
              </button>
              <button className="btn" onClick={() => setAssigning(true)}><Icon name="calendar" size={18} /> Assign to client</button>
            </>
          )}
          <button className="btn primary" onClick={save} disabled={!form.name.trim() || (!dirty && !isNew)}>
            {dirty || isNew ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      <div className="board-shell">
        <div className="bank-panel">{exercises ? <ExerciseBank exercises={exercises} onPick={(e) => { setItems([...items, fromExercise(e)]); setDirty(true); }} /> : <Spinner />}</div>
        <div className="stack" style={{ maxWidth: 720 }}>
          <div className="card pad stack">
            <label className="field"><span>Name</span><input className="input" value={form.name} onChange={set("name")} placeholder="e.g. Strength A" /></label>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <label className="field grow">
                <span>Folder</span>
                <input className="input" list="folders" value={form.folder} onChange={set("folder")} placeholder="e.g. Phase 14, Knee, Mobility days" />
                <datalist id="folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
              </label>
              <label className="field grow"><span>Tags</span><input className="input" value={form.tags} onChange={set("tags")} placeholder="comma separated" /></label>
            </div>
            <label className="field"><span>Note to client</span><textarea className="textarea" style={{ minHeight: 60 }} value={form.notes} onChange={set("notes")} /></label>
          </div>
          <div className="card pad">
            <div className="row between" style={{ marginBottom: 8 }}>
              <h3>Exercises</h3>
              <span className="tiny faint">Drag to reorder · tap the link icon to superset</span>
            </div>
            <ItemList columnId="template" items={items} onChange={(next) => { setItems(next); setDirty(true); }} />
          </div>
        </div>
      </div>
      {assigning && <AssignTemplate templateId={id} name={form.name} onClose={() => setAssigning(false)} />}
    </div>
  );
}

function AssignTemplate({ templateId, name, onClose }: { templateId: string; name: string; onClose: () => void }) {
  const { data: patients } = useApi<PatientRow[]>("/patients");
  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState(ymd());
  const [repeat, setRepeat] = useState(1);
  const [every, setEvery] = useState(7);
  const nav = useNavigate();
  const assign = async () => {
    const dates = Array.from({ length: repeat }, (_, i) => addDays(date, i * every));
    try {
      await api.post(`/templates/${templateId}/assign`, { patientId, dates });
      toast(`Scheduled ${dates.length} workout${dates.length > 1 ? "s" : ""}`);
      nav(`/clients/${patientId}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <div className="stack">
        <h2>Assign “{name}”</h2>
        <label className="field">
          <span>Client</span>
          <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Choose a client…</option>
            {(patients ?? []).filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <label className="field grow"><span>First date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field" style={{ width: 110 }}><span>Times</span><input className="input" type="number" min={1} max={60} value={repeat} onChange={(e) => setRepeat(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} /></label>
          <label className="field" style={{ width: 150 }}>
            <span>Every</span>
            <select className="input" value={every} onChange={(e) => setEvery(Number(e.target.value))}>
              <option value={1}>day</option>
              <option value={2}>2 days</option>
              <option value={3}>3 days</option>
              <option value={7}>week</option>
            </select>
          </label>
        </div>
        <button className="btn primary block" disabled={!patientId} onClick={assign}>Schedule</button>
      </div>
    </Sheet>
  );
}
