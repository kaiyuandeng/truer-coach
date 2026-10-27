import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { useApi } from "../../hooks";
import { useSession } from "../../session";
import { Icon } from "../../components/Icon";
import { Spinner, toast } from "../../components/ui";
import { COVERS, CourseCard, LEVELS, money, storeUrl, type Course } from "../store/shared";
import type { Program } from "./Library";

const blank = { title: "", tagline: "", description: "", highlights: "", level: "All levels", cover: "violet", price: "49", program_id: "", published: false };

/** Package one of the coach's programs as a course: title, pitch, price, and a cover. */
export function CourseEditor() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const nav = useNavigate();
  const { me } = useSession();
  const programs = useApi<Program[]>("/programs");
  const courses = useApi<{ courses: Course[] }>(isNew ? null : "/courses");
  const [form, setForm] = useState(blank);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const existing = courses.data?.courses.find((c) => c.id === id);

  useEffect(() => {
    if (!existing) return;
    setForm({
      title: existing.title,
      tagline: existing.tagline ?? "",
      description: existing.description ?? "",
      highlights: existing.highlights ?? "",
      level: existing.level,
      cover: existing.cover,
      price: String(existing.price_cents / 100),
      program_id: existing.program_id,
      published: !!existing.published,
    });
  }, [existing]);

  // New courses start from the first program, named after it.
  useEffect(() => {
    if (isNew && programs.data?.length && !form.program_id) {
      const p = programs.data[0];
      setForm((f) => ({ ...f, program_id: p.id, title: f.title || p.name, description: f.description || (p.description ?? "") }));
    }
  }, [isNew, programs.data, form.program_id]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const priceCents = Math.round((Number(form.price) || 0) * 100);
  const program = programs.data?.find((p) => p.id === form.program_id);

  const save = async (publish?: boolean) => {
    setBusy(true);
    const payload = {
      title: form.title,
      tagline: form.tagline,
      description: form.description,
      highlights: form.highlights,
      level: form.level,
      cover: form.cover,
      price_cents: priceCents,
      program_id: form.program_id,
      published: publish ?? form.published,
    };
    try {
      if (isNew) {
        const r = await api.post<{ id: string }>("/courses", payload);
        nav(`/courses/${r.id}`, { replace: true });
      } else await api.put(`/courses/${id}`, payload);
      setForm((f) => ({ ...f, published: payload.published }));
      setDirty(false);
      toast(publish === undefined ? "Saved" : publish ? "Published to your store" : "Moved back to drafts");
      courses.reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!programs.data || (!isNew && !courses.data)) return <Spinner />;
  if (!isNew && !existing) return <div className="error">Course not found</div>;

  const preview: Course = {
    ...(existing ?? ({} as Course)),
    id,
    therapist_id: me.id,
    title: form.title || "Untitled course",
    tagline: form.tagline || null,
    level: form.level,
    cover: form.cover,
    price_cents: priceCents,
    weeks: program?.weeks ?? 0,
    days_per_week: program?.days_per_week ?? 0,
    workout_count: program?.days.length ?? 0,
    exercise_count: existing && existing.program_id === form.program_id ? existing.exercise_count : [...new Map(program?.days.map((d) => [d.template_id, d.item_count])).values()].reduce((a, b) => a + b, 0),
    purchase_id: null,
  };

  return (
    <div>
      <Link to="/courses" className="row small" style={{ gap: 4, marginBottom: 8 }}>
        <Icon name="back" size={16} /> Store
      </Link>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <div className="row">
          <h1>{isNew ? "New course" : form.title}</h1>
          {!isNew && (form.published ? <span className="chip accent">Live</span> : <span className="chip">Draft</span>)}
        </div>
        <div className="row">
          {!isNew && (
            <>
              <button
                className="btn danger"
                title="Delete course"
                onClick={async () => {
                  if (!confirm("Delete this course? The program itself stays in your library.")) return;
                  try {
                    await api.del(`/courses/${id}`);
                    nav("/courses");
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                <Icon name="trash" size={18} />
              </button>
              <a className="btn" href={storeUrl(me.id, id)} target="_blank" rel="noreferrer"><Icon name="eye" size={18} /> Preview</a>
            </>
          )}
          <button className="btn" disabled={busy || !form.title.trim() || !form.program_id || (!dirty && !isNew)} onClick={() => save()}>{dirty || isNew ? "Save" : "Saved"}</button>
          <button className={`btn${form.published ? "" : " primary"}`} disabled={busy || !form.title.trim() || !form.program_id} onClick={() => save(!form.published)}>
            {form.published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {!programs.data.length ? (
        <div className="card pad">
          A course delivers one of your programs. <Link to="/programs/new">Build a program first</Link>, then come back to put it on sale.
        </div>
      ) : (
        <div className="editor-grid">
          <div className="stack">
            <div className="card pad stack">
              <label className="field">
                <span>Program buyers get</span>
                <select className="input" value={form.program_id} onChange={(e) => set("program_id", e.target.value)}>
                  {programs.data.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.weeks} wk × {p.days_per_week}/wk, {p.days.length} workouts)</option>
                  ))}
                </select>
              </label>
              {program && (
                <div className="tiny faint">
                  Buyers pick a start date and training days, and these workouts go on their calendar. Edit the workouts in <Link to={`/programs/${program.id}`}>{program.name}</Link>.
                </div>
              )}
              <label className="field"><span>Title</span><input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Plantar Fascia Reset" /></label>
              <label className="field"><span>Tagline</span><input className="input" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="e.g. Four weeks to pain-free mornings" /></label>
              <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
                <label className="field" style={{ width: 160 }}>
                  <span>Price (USD)</span>
                  <input className="input" type="number" min={0} step="1" value={form.price} onChange={(e) => set("price", e.target.value)} />
                </label>
                <label className="field grow">
                  <span>Level</span>
                  <select className="input" value={form.level} onChange={(e) => set("level", e.target.value)}>
                    {LEVELS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </label>
              </div>
              <div className="field">
                <span>Cover</span>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {COVERS.map((c) => (
                    <button key={c} type="button" aria-label={c} aria-pressed={form.cover === c} className={`swatch cover-${c}${form.cover === c ? " on" : ""}`} onClick={() => set("cover", c)} />
                  ))}
                </div>
              </div>
            </div>
            <div className="card pad stack">
              <label className="field">
                <span>Description</span>
                <textarea className="textarea" rows={6} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What the course is, who it's for, and what results to expect." />
              </label>
              <label className="field">
                <span>Highlights (one per line)</span>
                <textarea className="textarea" rows={4} value={form.highlights} onChange={(e) => set("highlights", e.target.value)} placeholder={"Who it's for\nHow long each session takes\nEquipment needed"} />
              </label>
            </div>
          </div>
          <div className="stack editor-preview">
            <div className="section-title" style={{ margin: "0 4px" }}>Store preview</div>
            <CourseCard course={preview} onClick={() => !isNew && window.open(storeUrl(me.id, id), "_blank")} footer={<span className="price">{money(priceCents)}</span>} />
            {!isNew && existing && (
              <div className="card pad small stack" style={{ gap: 6 }}>
                <div className="row between"><span className="muted">Sold</span><b>{existing.sales}</b></div>
                <div className="row between"><span className="muted">Revenue</span><b>{money(existing.revenue_cents).replace("Free", "$0")}</b></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
