import { useMemo, useRef, useState } from "react";
import { api, type Exercise } from "../../api";
import { Icon } from "../../components/Icon";
import { Empty, Sheet, Spinner, toast } from "../../components/ui";
import { Video, hasVideo } from "../../components/Video";
import { useCoachLibrary } from "./library";

/** The coach's bank of exercises: name, body area, instructions, and a demo video (uploaded or linked). */
export function Exercises() {
  const { exercises, reloadExercises } = useCoachLibrary();
  const [q, setQ] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exercise | "new" | null>(null);
  const areas = useMemo(() => [...new Set((exercises ?? []).map((e) => e.body_area).filter(Boolean))].sort() as string[], [exercises]);
  const list = (exercises ?? []).filter(
    (e) => (!area || e.body_area === area) && (!q || `${e.name} ${e.category ?? ""} ${e.body_area ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Exercises</h1>
          <div className="muted small">{exercises?.length ?? 0} in your bank</div>
        </div>
        <button className="btn primary" onClick={() => setEditing("new")}><Icon name="plus" size={18} /> New exercise</button>
      </div>
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {areas.map((a) => (
            <button key={a} className={`chip${area === a ? " brand" : ""}`} onClick={() => setArea(area === a ? null : a)}>{a}</button>
          ))}
        </div>
      </div>
      {!exercises ? (
        <Spinner />
      ) : !list.length ? (
        <div className="card pad"><Empty icon="library" title="No exercises match" /></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Exercise</th><th>Area</th><th>Default dose</th><th>Video</th><th>Used</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="click" onClick={() => setEditing(e)}>
                  <td>
                    <div style={{ fontWeight: 650 }}>{e.name}</div>
                    <div className="tiny faint">{e.therapist_id ? e.category : `Starter library · ${e.category ?? ""}`}</div>
                  </td>
                  <td className="small">{e.body_area}</td>
                  <td className="small">{e.default_instructions}</td>
                  <td>{e.video_key ? <span className="chip accent">Uploaded</span> : e.video_url ? <span className="chip">Link</span> : <span className="faint">–</span>}</td>
                  <td className="small">{e.times_used ? `${e.times_used}×` : <span className="faint">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ExerciseSheet
          exercise={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadExercises();
          }}
        />
      )}
    </div>
  );
}

function ExerciseSheet({ exercise, onClose, onSaved }: { exercise: Exercise | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: exercise?.name ?? "",
    body_area: exercise?.body_area ?? "",
    category: exercise?.category ?? "",
    default_instructions: exercise?.default_instructions ?? "",
    description: exercise?.description ?? "",
    video_url: exercise?.video_url ?? "",
    video_key: exercise?.video_key ?? null as string | null,
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    try {
      if (exercise) await api.patch(`/exercises/${exercise.id}`, form);
      else await api.post("/exercises", form);
      toast(exercise && !exercise.therapist_id ? "Saved as your own copy" : "Saved");
      onSaved();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <Sheet open onClose={onClose}>
      <div className="stack">
        <h2>{exercise ? "Edit exercise" : "New exercise"}</h2>
        {exercise && !exercise.therapist_id && <div className="small muted">This is from the starter library. Saving makes your own copy.</div>}
        <label className="field"><span>Name</span><input className="input" value={form.name} onChange={set("name")} autoFocus={!exercise} /></label>
        <div className="row">
          <label className="field grow"><span>Body area</span><input className="input" value={form.body_area} onChange={set("body_area")} placeholder="Knee, Ankle, Hip…" /></label>
          <label className="field grow"><span>Type</span><input className="input" value={form.category} onChange={set("category")} placeholder="Mobility, Strength…" /></label>
        </div>
        <label className="field"><span>Default sets / reps</span><input className="input" value={form.default_instructions} onChange={set("default_instructions")} placeholder="e.g. 2x12, x :30 seconds each" /></label>
        <label className="field"><span>How to do it</span><textarea className="textarea" value={form.description} onChange={set("description")} /></label>
        <div className="field">
          <span>Demo video</span>
          {hasVideo(form) && <Video videoKey={form.video_key} videoUrl={form.video_key ? null : form.video_url || null} title={form.name} />}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept="video/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              try {
                const r = await api.upload(f);
                setForm((cur) => ({ ...cur, video_key: r.key }));
              } catch (err) {
                toast((err as Error).message);
              } finally {
                setUploading(false);
              }
            }} />
            <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="camera" size={16} /> {uploading ? "Uploading…" : form.video_key ? "Replace video" : "Upload or record"}
            </button>
            {form.video_key && <button className="btn sm danger" onClick={() => setForm({ ...form, video_key: null })}>Remove upload</button>}
          </div>
          {!form.video_key && <input className="input" value={form.video_url} onChange={set("video_url")} placeholder="…or paste a YouTube / Vimeo link" />}
        </div>
        <div className="row">
          {exercise?.therapist_id && (
            <button className="btn danger" onClick={async () => {
              try {
                await api.del(`/exercises/${exercise.id}`);
                onSaved();
              } catch (e) {
                toast((e as Error).message);
              }
            }}><Icon name="trash" size={18} /></button>
          )}
          <button className="btn primary grow" disabled={!form.name.trim() || uploading} onClick={save}>Save</button>
        </div>
      </div>
    </Sheet>
  );
}
