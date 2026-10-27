import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Workout } from "../../api";
import { labelItems } from "../../blocks";
import { dayLabel, relTime } from "../../dates";
import { useApi } from "../../hooks";
import { Icon } from "../../components/Icon";
import { Spinner, painColor, toast } from "../../components/ui";
import { Comments, HistorySheet, ItemCard, groupBlocks } from "../../components/WorkoutParts";

/** What the client did: every exercise with their results, plus the comment thread. */
export function CoachWorkout() {
  const { id = "" } = useParams();
  const { data: w, reload } = useApi<Workout>(`/workouts/${id}`);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  if (!w) return <Spinner />;
  const items = labelItems(w.items);
  const done = items.filter((i) => i.done).length;
  return (
    <div style={{ maxWidth: 760 }}>
      <Link to={`/clients/${w.patient_id}`} className="row small" style={{ gap: 4, marginBottom: 8 }}>
        <Icon name="back" size={16} /> Back to client
      </Link>
      <div className="row between" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div className="muted small">{dayLabel(w.scheduled_on, { long: true })}</div>
          <h1>{w.title}</h1>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={async () => {
              await api.post("/templates", { fromWorkoutId: w.id });
              toast("Saved to your workouts library");
            }}
          >
            <Icon name="library" size={18} /> Save as reusable
          </button>
          <Link className="btn" to={`/clients/${w.patient_id}`}><Icon name="board" size={18} /> Edit on board</Link>
        </div>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {w.completed_at ? <span className="chip accent"><Icon name="check" size={14} /> Completed {relTime(w.completed_at)}</span> : <span className="chip">Not completed</span>}
        <span className="chip">{done}/{items.length} exercises done</span>
        {w.pain_after !== null && <span className="chip" style={{ background: painColor(w.pain_after), color: "#fff" }}>Pain after: {w.pain_after}/10</span>}
      </div>
      {w.notes && <div className="card pad" style={{ marginBottom: 16, borderLeft: "4px solid var(--brand)" }}><div className="pre">{w.notes}</div></div>}
      <div className="section-title" style={{ marginTop: 0 }}>Comments</div>
      <Comments workoutId={w.id} comments={w.comments} onPosted={reload} />
      <div className="section-title">Exercises</div>
      <div className="stack">
        {groupBlocks(items).map((g) => (
          <div key={g[0].id} className="ex-group">
            {g.map((item) => (
              <ItemCard key={item.id} item={item} editable={false} onOpenHistory={() => setHistoryFor({ id: item.exercise_id, name: item.name })} />
            ))}
          </div>
        ))}
      </div>
      <HistorySheet exercise={historyFor} patientId={w.patient_id} onClose={() => setHistoryFor(null)} />
    </div>
  );
}
