import { useMemo, useState, type DragEvent } from "react";
import type { Exercise } from "../api";
import { Icon } from "./Icon";

/** An exercise row while it's being edited on the board or in a template. */
export type DraftItem = {
  key: string;
  id?: string;
  exercise_id: string;
  name: string;
  instructions: string;
  /** True when this item is in a superset with the one above it. */
  linked: boolean;
  done?: number;
  result?: string | null;
  pain?: number | null;
};

let keySeq = 0;
export const newKey = () => `k${++keySeq}`;

export function toDraft(items: { id?: string; exercise_id: string; name: string; block: string; instructions: string | null; done?: number; result?: string | null; pain?: number | null }[]): DraftItem[] {
  return items.map((it, i) => ({
    key: newKey(),
    id: it.id,
    exercise_id: it.exercise_id,
    name: it.name,
    instructions: it.instructions ?? "",
    linked: i > 0 && items[i - 1].block === it.block,
    done: it.done,
    result: it.result,
    pain: it.pain,
  }));
}

/** Assigns block letters from the superset links: A, A, B, C, C... */
export function withBlocks(items: DraftItem[]) {
  let letter = -1;
  return items.map((it, i) => {
    if (i === 0 || !it.linked) letter++;
    const block = letter < 26 ? String.fromCharCode(65 + letter) : "Z" + String.fromCharCode(65 + (letter - 26) % 26);
    return { ...it, block };
  });
}

export function labels(items: DraftItem[]) {
  const blocked = withBlocks(items);
  return blocked.map((it, i) => {
    const groupSize = blocked.filter((x) => x.block === it.block).length;
    const n = blocked.slice(0, i + 1).filter((x) => x.block === it.block).length;
    return groupSize > 1 ? `${it.block}${n}` : it.block;
  });
}

export function toPayload(items: DraftItem[]) {
  return withBlocks(items).map((it) => ({ id: it.id, exercise_id: it.exercise_id, block: it.block, instructions: it.instructions.trim() || null }));
}

export function fromExercise(e: Exercise): DraftItem {
  return { key: newKey(), exercise_id: e.id, name: e.name, instructions: e.default_instructions ?? "", linked: false };
}

// ---------- Drag payloads ----------

export type DragPayload =
  | { kind: "exercise"; exercise: Exercise }
  | { kind: "template"; templateId: string; name: string }
  | { kind: "item"; from: string; key: string }
  | { kind: "workout"; workoutId: string };

const MIME = "application/x-rehabloop";
let current: DragPayload | null = null; // Safari hides dataTransfer contents during dragover

export function startDrag(e: DragEvent, payload: DragPayload) {
  current = payload;
  e.dataTransfer.setData(MIME, JSON.stringify(payload));
  e.dataTransfer.setData("text/plain", payload.kind);
  e.dataTransfer.effectAllowed = "copyMove";
}

export function readDrag(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(MIME);
    if (raw) return JSON.parse(raw) as DragPayload;
  } catch {
    /* fall through */
  }
  return current;
}

export function endDrag() {
  current = null;
}

// ---------- Editable column of exercises ----------

/**
 * An ordered, editable list of exercises. Accepts exercises dragged from the bank, and items dragged from
 * this or another column (`columnId` identifies the source).
 */
export function ItemList({
  columnId,
  items,
  onChange,
  onDropForeignItem,
  compact,
}: {
  columnId: string;
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  /** Called when an item from another column is dropped here, with the insert index. */
  onDropForeignItem?: (fromColumn: string, key: string, index: number) => void;
  compact?: boolean;
}) {
  const [over, setOver] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const lbl = useMemo(() => labels(items), [items]);

  const dropAt = (e: DragEvent, index: number) => {
    setOver(null);
    const p = readDrag(e);
    // Whole workouts and saved workouts are the board's business: let the drop bubble up to it.
    if (!p || (p.kind !== "exercise" && p.kind !== "item")) return;
    e.preventDefault();
    e.stopPropagation();
    endDrag();
    if (p.kind === "exercise") {
      const next = [...items];
      next.splice(index, 0, fromExercise(p.exercise));
      onChange(next);
    } else if (p.kind === "item") {
      if (p.from === columnId) {
        const from = items.findIndex((i) => i.key === p.key);
        if (from === -1) return;
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(from < index ? index - 1 : index, 0, moved);
        if (next[0]) next[0] = { ...next[0], linked: false };
        onChange(next);
      } else onDropForeignItem?.(p.from, p.key, index);
    }
  };

  const update = (key: string, patch: Partial<DraftItem>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  return (
    <div
      className="item-list"
      onDragOver={(e) => {
        e.preventDefault();
        if (over === null) setOver(items.length);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
      }}
      onDrop={(e) => dropAt(e, over ?? items.length)}
    >
      {items.map((it, i) => (
        <div key={it.key}>
          {i > 0 && (
            <button
              className={`link-toggle${it.linked ? " on" : ""}`}
              title={it.linked ? "Split superset" : "Superset with the exercise above"}
              onClick={() => update(it.key, { linked: !it.linked })}
            >
              <Icon name="link" size={12} />
            </button>
          )}
          <div
            className={`draft-item${over === i ? " drop-before" : ""}${it.linked ? " linked" : ""}${items[i + 1]?.linked ? " linked-next" : ""}`}
            draggable
            onDragStart={(e) => startDrag(e, { kind: "item", from: columnId, key: it.key })}
            onDragEnd={endDrag}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setOver(e.clientY < r.top + r.height / 2 ? i : i + 1);
            }}
            onDrop={(e) => dropAt(e, over ?? i)}
          >
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="draft-name" title={it.name}>
                <span className="draft-label">{lbl[i]}</span>
                {it.done ? <span style={{ color: "var(--accent)" }}>✓ </span> : null}
                {it.name}
              </div>
              {editing === it.key ? (
                <input
                  className="input draft-instr-input"
                  autoFocus
                  value={it.instructions}
                  placeholder="e.g. 3x10, x :30 seconds each"
                  onChange={(e) => update(it.key, { instructions: e.target.value })}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                />
              ) : (
                <button className="draft-instr" onClick={() => setEditing(it.key)}>
                  {it.instructions || <span className="faint">Add sets / reps</span>}
                </button>
              )}
              {!compact && it.result && <div className="tiny muted ellipsis">“{it.result}”</div>}
            </div>
            <button className="icon-btn plain draft-remove" aria-label={`Remove ${it.name}`} onClick={() => onChange(items.filter((x) => x.key !== it.key).map((x, n) => (n === 0 ? { ...x, linked: false } : x)))}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      ))}
      <div className={`drop-tail${over === items.length ? " active" : ""}`}>
        {items.length ? "Drop to add" : "Drag exercises here"}
      </div>
    </div>
  );
}

// ---------- Exercise bank ----------

export function ExerciseBank({
  exercises,
  templates,
  onPick,
  workoutsOnly,
}: {
  exercises: Exercise[];
  templates?: { id: string; name: string; folder: string | null; items: unknown[] }[];
  /** Tap-to-add for touch screens where drag isn't available. */
  onPick?: (e: Exercise) => void;
  workoutsOnly?: boolean;
}) {
  const [tab, setTab] = useState<"exercises" | "workouts">(workoutsOnly ? "workouts" : "exercises");
  const [q, setQ] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const areas = useMemo(() => [...new Set(exercises.map((e) => e.body_area).filter(Boolean))].sort() as string[], [exercises]);
  const filtered = exercises.filter(
    (e) =>
      (!area || e.body_area === area) &&
      (!q || `${e.name} ${e.body_area ?? ""} ${e.category ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );
  const mine = filtered.filter((e) => e.therapist_id);
  const builtIn = filtered.filter((e) => !e.therapist_id);

  const row = (e: Exercise) => (
    <div key={e.id} className="bank-row" draggable onDragStart={(ev) => startDrag(ev, { kind: "exercise", exercise: e })} onDragEnd={endDrag}>
      <span className="drag"><Icon name="drag" size={16} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
        <div className="tiny faint ellipsis">{[e.body_area, e.category, e.default_instructions].filter(Boolean).join(" · ")}</div>
      </div>
      {(e.video_key || e.video_url) && <span className="faint" title="Has video"><Icon name="video" size={14} /></span>}
      {onPick && (
        <button className="icon-btn plain" style={{ width: 28, height: 28 }} aria-label={`Add ${e.name}`} onClick={() => onPick(e)}>
          <Icon name="plus" size={16} />
        </button>
      )}
    </div>
  );

  return (
    <div className="bank">
      {templates && !workoutsOnly && (
        <div className="segmented" style={{ marginBottom: 8 }}>
          <button className={tab === "exercises" ? "on" : ""} onClick={() => setTab("exercises")}>Exercises</button>
          <button className={tab === "workouts" ? "on" : ""} onClick={() => setTab("workouts")}>Saved workouts</button>
        </div>
      )}
      <input className="input" placeholder={tab === "exercises" ? "Search exercises" : "Search saved workouts"} value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: "9px 12px" }} />
      {tab === "exercises" ? (
        <>
          <div className="chips">
            {areas.map((a) => (
              <button key={a} className={`chip${area === a ? " brand" : ""}`} onClick={() => setArea(area === a ? null : a)}>{a}</button>
            ))}
          </div>
          <div className="bank-list">
            {mine.length > 0 && <div className="bank-section">Your exercises</div>}
            {mine.map(row)}
            {builtIn.length > 0 && <div className="bank-section">Starter library</div>}
            {builtIn.map(row)}
            {!filtered.length && <div className="faint small center" style={{ padding: 16 }}>No matches</div>}
          </div>
        </>
      ) : (
        <div className="bank-list" style={{ marginTop: 8 }}>
          {(templates ?? [])
            .filter((t) => !q || `${t.name} ${t.folder ?? ""}`.toLowerCase().includes(q.toLowerCase()))
            .map((t) => (
              <div key={t.id} className="bank-row" draggable onDragStart={(ev) => startDrag(ev, { kind: "template", templateId: t.id, name: t.name })} onDragEnd={endDrag}>
                <span className="drag"><Icon name="drag" size={16} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div className="tiny faint">{[t.folder, `${t.items.length} exercises`].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
