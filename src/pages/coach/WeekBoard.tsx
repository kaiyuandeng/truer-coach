import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Exercise, type WorkoutSummary } from "../../api";
import { addDays, parseYmd, startOfWeek, ymd } from "../../dates";
import { Icon } from "../../components/Icon";
import { Sheet, Spinner, toast } from "../../components/ui";
import { ExerciseBank, ItemList, endDrag, fromExercise, readDrag, startDrag, toDraft, toPayload, type DraftItem } from "../../components/board";
import { useCoachLibrary } from "./library";

type Col = { id: string; title: string; scheduled_on: string; notes: string | null; completed_at: string | null; items: DraftItem[] };

/** Evan's weekly board: drag exercises from the bank into each day. Every change saves itself. */
export function WeekBoard({ patientId }: { patientId: string }) {
  const nav = useNavigate();
  const { exercises, templates, reloadTemplates } = useCoachLibrary();
  const [week, setWeek] = useState(startOfWeek(ymd()));
  const [cols, setCols] = useState<Col[] | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [showBank, setShowBank] = useState(() => {
    try {
      return localStorage.getItem("board.bank") !== "hidden";
    } catch {
      return true;
    }
  });
  const toggleBank = () =>
    setShowBank((v) => {
      try {
        localStorage.setItem("board.bank", v ? "hidden" : "shown");
      } catch {
        /* private mode */
      }
      return !v;
    });
  const timers = useRef(new Map<string, number>());
  const latest = useRef<Col[] | null>(null);
  latest.current = cols;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  const load = useCallback(async () => {
    const list = await api.get<(WorkoutSummary & { items: { id: string; exercise_id: string; name: string; block: string; instructions: string | null; done: number; result: string | null; pain: number | null }[] })[]>(
      `/workouts?patientId=${patientId}&from=${week}&to=${addDays(week, 6)}`,
    );
    setCols(list.map((w) => ({ id: w.id, title: w.title, scheduled_on: w.scheduled_on, notes: w.notes, completed_at: w.completed_at, items: toDraft(w.items) })));
  }, [patientId, week]);

  useEffect(() => {
    setCols(null);
    load().catch((e) => toast(e.message));
  }, [load]);

  const save = useCallback(async (workoutId: string) => {
    const col = latest.current?.find((c) => c.id === workoutId);
    if (!col) return;
    setSaving((n) => n + 1);
    try {
      const sent = col.items;
      const r = await api.put<{ itemIds: string[] }>(`/workouts/${workoutId}`, {
        title: col.title.trim() || "Workout",
        scheduled_on: col.scheduled_on,
        notes: col.notes,
        items: toPayload(sent),
      });
      // New items get their server ids so the next save updates rather than re-inserts them.
      const idByKey = new Map(sent.map((it, i) => [it.key, r.itemIds[i]]));
      setCols((cur) => cur?.map((c) => (c.id === workoutId ? { ...c, items: c.items.map((it) => (it.id ? it : { ...it, id: idByKey.get(it.key) })) } : c)) ?? cur);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving((n) => n - 1);
    }
  }, []);

  const queueSave = (workoutId: string) => {
    clearTimeout(timers.current.get(workoutId));
    timers.current.set(workoutId, window.setTimeout(() => save(workoutId), 500));
  };

  const patchCol = (workoutId: string, patch: Partial<Col>) => {
    setCols((cur) => cur?.map((c) => (c.id === workoutId ? { ...c, ...patch } : c)) ?? cur);
    queueSave(workoutId);
  };

  const createOn = async (date: string, items: DraftItem[]) => {
    try {
      await api.post("/workouts", { patientId, scheduled_on: date, title: "New workout", items: toPayload(items) });
      await load();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const dropOnDay = async (date: string, e: React.DragEvent) => {
    e.preventDefault();
    setOverDay(null);
    const p = readDrag(e);
    endDrag();
    if (!p) return;
    if (p.kind === "exercise") await createOn(date, [fromExercise(p.exercise)]);
    else if (p.kind === "template") {
      try {
        await api.post(`/templates/${p.templateId}/assign`, { patientId, dates: [date] });
        toast(`Added ${p.name}`);
        await load();
      } catch (err) {
        toast((err as Error).message);
      }
    } else if (p.kind === "workout") {
      const col = cols?.find((c) => c.id === p.workoutId);
      if (col && col.scheduled_on !== date) patchCol(col.id, { scheduled_on: date });
    } else if (p.kind === "item") {
      // An exercise dragged out of one workout into an empty day starts a new workout there.
      const from = cols?.find((c) => c.id === p.from);
      const item = from?.items.find((i) => i.key === p.key);
      if (!from || !item) return;
      patchCol(from.id, { items: from.items.filter((i) => i.key !== p.key) });
      await createOn(date, [{ ...item, id: undefined, linked: false }]);
    }
  };

  const moveBetween = (toId: string) => (fromId: string, key: string, index: number) => {
    const from = cols?.find((c) => c.id === fromId);
    const to = cols?.find((c) => c.id === toId);
    const item = from?.items.find((i) => i.key === key);
    if (!from || !to || !item) return;
    const nextTo = [...to.items];
    nextTo.splice(index, 0, { ...item, id: undefined, linked: false, done: 0, result: null, pain: null });
    patchCol(from.id, { items: from.items.filter((i) => i.key !== key) });
    patchCol(to.id, { items: nextTo });
  };

  const copyWeek = async () => {
    if (!cols?.length) return;
    try {
      for (const c of cols) await api.post(`/workouts/${c.id}/copy`, { dates: [addDays(c.scheduled_on, 7)] });
      toast(`Copied ${cols.length} workout${cols.length > 1 ? "s" : ""} to next week`);
      setWeek(addDays(week, 7));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const remove = async (c: Col) => {
    if (!confirm(`Delete "${c.title}"? Any results logged on it are deleted too.`)) return;
    await api.del(`/workouts/${c.id}`);
    load();
  };

  const saveAsTemplate = async (c: Col) => {
    const name = prompt("Save as a reusable workout. Name:", c.title);
    if (!name) return;
    await save(c.id);
    await api.post("/templates", { fromWorkoutId: c.id, name });
    reloadTemplates();
    toast("Saved to your workouts library");
  };

  const today = ymd();

  return (
    <div className={`board-shell${showBank ? "" : " bank-hidden"}`}>
      <div className="bank-panel">
        {exercises ? (
          <ExerciseBank exercises={exercises} templates={templates ?? []} onPick={pickFor ? (e: Exercise) => addPicked(e) : undefined} />
        ) : (
          <Spinner />
        )}
        <div className="tiny faint" style={{ marginTop: 8 }}>Drag an exercise or saved workout onto a day.</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row between" style={{ marginBottom: 10, flexWrap: "wrap" }}>
          <div className="row">
            <button className="icon-btn" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><Icon name="back" size={20} /></button>
            <h2 style={{ minWidth: 200, textAlign: "center" }}>
              {parseYmd(week).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {parseYmd(addDays(week, 6)).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </h2>
            <button className="icon-btn" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><Icon name="chev" size={20} /></button>
            {week !== startOfWeek(today) && <button className="btn sm ghost" onClick={() => setWeek(startOfWeek(today))}>This week</button>}
          </div>
          <div className="row">
            <span className="small faint">{saving ? "Saving…" : "All changes saved"}</span>
            <button className="btn sm bank-toggle" onClick={() => toggleBank()}>
              <Icon name="dumbbell" size={16} /> {showBank ? "Hide bank" : "Exercise bank"}
            </button>
            <button className="btn sm" onClick={copyWeek} disabled={!cols?.length}><Icon name="copy" size={16} /> Copy week forward</button>
          </div>
        </div>
        {!cols ? (
          <Spinner />
        ) : (
          <div className="week-board">
            {days.map((d) => {
              const dayCols = cols.filter((c) => c.scheduled_on === d);
              return (
                <div
                  key={d}
                  className={`day-col${d === today ? " today" : ""}${overDay === d ? " drag-over" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overDay !== d) setOverDay(d);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverDay(null);
                  }}
                  onDrop={(e) => dropOnDay(d, e)}
                >
                  <div className="day-col-head">
                    <span className="dname">{parseYmd(d).toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className="dnum">{parseYmd(d).getDate()}</span>
                  </div>
                  {dayCols.map((c) => (
                    <div
                      key={c.id}
                      className={`wk-card${c.completed_at ? " done" : ""}`}
                      onDrop={(e) => {
                        e.stopPropagation();
                        const p = readDrag(e);
                        // An exercise dropped on the card's header joins this workout rather than starting a new one.
                        if (p?.kind === "exercise") {
                          e.preventDefault();
                          endDrag();
                          setOverDay(null);
                          patchCol(c.id, { items: [...c.items, fromExercise(p.exercise)] });
                        } else dropOnDay(d, e);
                      }}
                    >
                      <div className="wk-head">
                        <WorkoutTitle
                          workoutId={c.id}
                          title={c.title}
                          onChange={(title) => patchCol(c.id, { title })}
                        />
                        <WorkoutMenu
                          onOpen={() => nav(`/workouts/${c.id}`)}
                          onSaveTemplate={() => saveAsTemplate(c)}
                          onDelete={() => remove(c)}
                          onAdd={() => setPickFor(c.id)}
                        />
                      </div>
                      {c.completed_at && (
                        <button className="wk-done" onClick={() => nav(`/workouts/${c.id}`)} title="See results">
                          <Icon name="check" size={12} /> Done
                        </button>
                      )}
                      <ItemList
                        columnId={c.id}
                        items={c.items}
                        onChange={(items) => patchCol(c.id, { items })}
                        onDropForeignItem={moveBetween(c.id)}
                        compact
                      />
                    </div>
                  ))}
                  {!dayCols.length && (
                    <button className="day-empty" style={{ background: "transparent", cursor: "pointer" }} onClick={() => setPickFor(`new:${d}`)}>
                      Drop exercises or a saved workout
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pickFor && exercises && (
        <Sheet open onClose={() => setPickFor(null)}>
          <h2 style={{ marginBottom: 8 }}>Add exercise</h2>
          <ExerciseBank exercises={exercises} onPick={(e) => addPicked(e)} />
        </Sheet>
      )}
    </div>
  );

  // Tap-to-add fallback for touch screens.
  function addPicked(e: Exercise) {
    if (!pickFor) return;
    if (pickFor.startsWith("new:")) {
      createOn(pickFor.slice(4), [fromExercise(e)]);
      setPickFor(null);
      return;
    }
    const col = cols?.find((c) => c.id === pickFor);
    if (col) patchCol(col.id, { items: [...col.items, fromExercise(e)] });
    toast(`Added ${e.name}`);
  }
}

/** The workout's name. Drag it to move the workout to another day; click it to rename. */
function WorkoutTitle({ workoutId, title, onChange }: { workoutId: string; title: string; onChange: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <textarea
        className="wk-title"
        rows={1}
        ref={(el) => {
          autoSize(el);
          el?.focus();
        }}
        value={title}
        onChange={(e) => {
          autoSize(e.target);
          onChange(e.target.value.replace(/\n/g, " "));
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && (e.preventDefault(), setEditing(false))}
        aria-label="Workout title"
      />
    );
  return (
    <div
      className="wk-title as-text"
      draggable
      onDragStart={(e) => startDrag(e, { kind: "workout", workoutId })}
      onDragEnd={endDrag}
      onClick={() => setEditing(true)}
      title="Drag to another day · click to rename"
    >
      {title || "Workout"}
    </div>
  );
}

/** Grows a one-row textarea to fit its text, for browsers without CSS field-sizing. */
function autoSize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function WorkoutMenu({ onOpen, onSaveTemplate, onDelete, onAdd }: { onOpen: () => void; onSaveTemplate: () => void; onDelete: () => void; onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="wk-menu">
      <button className="icon-btn plain" style={{ width: 28, height: 28 }} aria-label="Workout options" onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="menu" onClick={() => setOpen(false)}>
            <button onClick={onOpen}><Icon name="workouts" size={16} /> Results & comments</button>
            <button onClick={onAdd}><Icon name="plus" size={16} /> Add exercise</button>
            <button onClick={onSaveTemplate}><Icon name="library" size={16} /> Save as reusable workout</button>
            <button onClick={onDelete} style={{ color: "var(--danger)" }}><Icon name="trash" size={16} /> Delete</button>
          </div>
        </>
      )}
    </div>
  );
}
