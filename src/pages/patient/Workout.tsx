import { useState } from "react";
import { useParams } from "react-router-dom";
import { api, type Workout, type WorkoutItem } from "../../api";
import { labelItems } from "../../blocks";
import { dayLabel } from "../../dates";
import { useApi } from "../../hooks";
import { Icon } from "../../components/Icon";
import { PainPicker, Sheet, Spinner, TopBar, toast } from "../../components/ui";
import { Comments, HistorySheet, ItemCard, ResultSheet, groupBlocks } from "../../components/WorkoutParts";
import { TimerSheet } from "../../components/TimerSheet";
import { confetti } from "../../components/confetti";

export function WorkoutPage() {
  const { id = "" } = useParams();
  const { data: w, setData, loading, error, reload } = useApi<Workout>(`/workouts/${id}`);
  const [resultFor, setResultFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);

  if (loading && !w) return <Spinner />;
  if (error || !w) return <div className="page"><TopBar back /><div className="error">{error}</div></div>;

  const items = labelItems(w.items);
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length && items.length > 0;

  const patchItem = (itemId: string, patch: Partial<WorkoutItem>) =>
    setData((cur) => (cur ? { ...cur, items: cur.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : cur));

  const toggle = async (item: WorkoutItem) => {
    const done = item.done ? 0 : 1;
    patchItem(item.id, { done });
    try {
      await api.patch(`/workouts/${w.id}/items/${item.id}`, { done: !!done });
      // Finishing the last exercise opens the wrap-up sheet.
      if (done && !w.completed_at && items.every((i) => i.id === item.id || i.done)) setFinishing(true);
    } catch (e) {
      patchItem(item.id, { done: item.done });
      toast((e as Error).message);
    }
  };

  const groups = groupBlocks(items);
  const resultItem = items.find((i) => i.id === resultFor) ?? null;

  return (
    <div className="app">
      <TopBar
        back="/"
        title={<div style={{ fontSize: 15 }}>{dayLabel(w.scheduled_on, { long: true })}</div>}
        right={
          <div className="head-actions">
            <button className="icon-btn plain" aria-label="Timer" onClick={() => setTimerOpen(true)}>
              <Icon name="timer" size={20} />
            </button>
            <button
              className="icon-btn plain"
              aria-label="Comments"
              onClick={() => document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Icon name="messages" size={20} />
            </button>
          </div>
        }
      />
      <div className="page no-tabs">
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 26 }}>{w.title}</h1>
          <div className="row muted small" style={{ marginTop: 4 }}>
            <span>{items.length} exercises</span>
            <span>·</span>
            <span>{doneCount} done</span>
            {w.completed_at && <span className="chip accent" style={{ marginLeft: "auto" }}><Icon name="check" size={14} /> Completed</span>}
          </div>
          <div className="progress-bar" style={{ marginTop: 10, background: "var(--surface-2)" }}>
            <div style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%`, background: "var(--accent)" }} />
          </div>
        </div>

        {w.notes && (
          <div className="card pad" style={{ marginBottom: 16, borderLeft: "4px solid var(--brand)" }}>
            <div className="tiny faint" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>From your therapist</div>
            <div className="pre" style={{ marginTop: 4 }}>{w.notes}</div>
          </div>
        )}

        <div className="stack">
          {groups.map((g) => (
            <div key={g[0].id} className="ex-group">
              {g.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  editable
                  onToggle={() => toggle(item)}
                  onOpenResult={() => setResultFor(item.id)}
                  onOpenHistory={() => setHistoryFor({ id: item.exercise_id, name: item.name })}
                />
              ))}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          {w.completed_at ? (
            <button
              className="btn block"
              onClick={async () => {
                await api.post(`/workouts/${w.id}/complete`, { completed: false });
                reload();
              }}
            >
              Mark as not finished
            </button>
          ) : (
            <button className={`btn lg block ${allDone ? "accent" : "primary"}`} onClick={() => setFinishing(true)}>
              <Icon name="check" size={20} /> Complete workout
            </button>
          )}
        </div>

        <div className="section-title" id="comments">Comments</div>
        <Comments workoutId={w.id} comments={w.comments} onPosted={reload} />
      </div>

      <ResultSheet
        item={resultItem}
        workoutId={w.id}
        onClose={() => setResultFor(null)}
        onSaved={(patch) => {
          patchItem(resultFor!, patch);
          if (patch.done && !w.completed_at && items.every((i) => i.id === resultFor || i.done)) setFinishing(true);
        }}
      />
      <HistorySheet exercise={historyFor} onClose={() => setHistoryFor(null)} />
      <TimerSheet open={timerOpen} onClose={() => setTimerOpen(false)} />
      {finishing && (
        <FinishSheet
          workoutId={w.id}
          remaining={items.length - doneCount}
          onClose={() => setFinishing(false)}
          onDone={() => {
            setFinishing(false);
            confetti();
            reload();
          }}
        />
      )}
    </div>
  );
}

export function FinishSheet({
  workoutId,
  remaining,
  onClose,
  onDone,
}: {
  workoutId: string;
  remaining: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pain, setPain] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    try {
      await api.post(`/workouts/${workoutId}/complete`, { pain_after: pain, comment });
      onDone();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <div className="stack">
        <div className="center">
          <div style={{ fontSize: 44 }}>🎉</div>
          <h2>{remaining ? "Wrap up this workout?" : "Nice work!"}</h2>
          {remaining > 0 && (
            <div className="muted small">{remaining} exercise{remaining > 1 ? "s are" : " is"} not checked off yet. That's OK, it still counts.</div>
          )}
        </div>
        <div className="field">
          <span>How's your pain now?</span>
          <PainPicker value={pain} onChange={setPain} />
        </div>
        <label className="field">
          <span>Note for your therapist (optional)</span>
          <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything that felt off, easy, or hard?" />
        </label>
        <button className="btn accent lg block" onClick={finish} disabled={busy}>
          <Icon name="check" size={20} /> Complete workout
        </button>
      </div>
    </Sheet>
  );
}
