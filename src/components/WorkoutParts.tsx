import { useEffect, useRef, useState } from "react";
import { api, mediaUrl, type Comment, type WorkoutItem } from "../api";
import { useApi } from "../hooks";
import { dayLabel, relTime } from "../dates";
import { Icon } from "./Icon";
import { Check, PainPicker, Sheet, Spinner, painColor, toast } from "./ui";
import { Video, hasVideo } from "./Video";
import { useSession } from "../session";

type Labeled = WorkoutItem & { label: string; superset: boolean };

export function Media({ mediaKey, type }: { mediaKey: string; type: string | null }) {
  if (type?.startsWith("video/"))
    return (
      <div className="video">
        <video src={mediaUrl(mediaKey)} controls playsInline preload="metadata" />
      </div>
    );
  return <img src={mediaUrl(mediaKey)} alt="" style={{ width: "100%", borderRadius: 12, marginTop: 8, display: "block" }} />;
}

/** One exercise, laid out like a TrueCoach card: header strip, name, demo video, instructions, results. */
export function ItemCard({
  item,
  editable,
  onToggle,
  onOpenResult,
  onOpenHistory,
}: {
  item: Labeled;
  editable: boolean;
  onToggle?: () => void;
  onOpenResult?: () => void;
  onOpenHistory?: () => void;
}) {
  const hasResult = !!(item.result || item.pain !== null || item.result_media_key);
  return (
    <div className="ex-card">
      <div className="ex-head">
        <span className="ex-kind">{item.superset ? "Superset" : "Single"}</span>
        <span className="ex-label">{item.label}</span>
        {editable ? (
          <Check on={!!item.done} onClick={onToggle!} label={`Mark ${item.name} done`} />
        ) : (
          <span className={`check${item.done ? " on" : ""}`} style={{ cursor: "default" }} aria-label={item.done ? "Done" : "Not done"}>
            <Icon name="check" />
          </span>
        )}
      </div>
      <div className="ex-body">
        <h3 className="ex-name">{item.name}</h3>
        {hasVideo(item) && <Video videoKey={item.video_key} videoUrl={item.video_url} title={item.name} />}
        {item.instructions && (
          <div className="ex-instructions">
            <div className="ex-subtitle">Instructions</div>
            <div className="pre">{item.instructions}</div>
          </div>
        )}
        {hasResult && (
          <div className="result" onClick={editable ? onOpenResult : undefined} style={editable ? { cursor: "pointer" } : undefined}>
            <div className="ex-subtitle" style={{ marginBottom: 4 }}>{editable ? "Your result" : "Result"}</div>
            {item.pain !== null && (
              <span className="chip" style={{ background: painColor(item.pain), color: "#fff", marginRight: 6, padding: "1px 8px" }}>
                Pain {item.pain}
              </span>
            )}
            {item.result && <span className="pre">{item.result}</span>}
            {item.result_media_key && <Media mediaKey={item.result_media_key} type={item.result_media_type} />}
          </div>
        )}
        {editable && (
          <button className="btn outline block" onClick={onOpenResult} style={{ marginTop: 14 }}>
            {hasResult ? `Edit results for ${item.label}` : `Add results for ${item.label}`}
          </button>
        )}
        {onOpenHistory && (
          <button className="btn ghost block sm" onClick={onOpenHistory} style={{ marginTop: 6 }}>
            <Icon name="history" size={16} /> Exercise History
          </button>
        )}
      </div>
    </div>
  );
}

/** Groups labeled items into supersets for display. */
export function groupBlocks<T extends { block: string }>(items: T[]): T[][] {
  const groups: T[][] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last[0].block === it.block) last.push(it);
    else groups.push([it]);
  }
  return groups;
}

export function ResultSheet({
  item,
  workoutId,
  onClose,
  onSaved,
}: {
  item: Labeled | null;
  workoutId: string;
  onClose: () => void;
  onSaved: (patch: Partial<WorkoutItem>) => void;
}) {
  const [result, setResult] = useState("");
  const [pain, setPain] = useState<number | null>(null);
  const [done, setDone] = useState(true);
  const [media, setMedia] = useState<{ key: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    setResult(item.result ?? "");
    setPain(item.pain);
    setDone(true);
    setMedia(item.result_media_key ? { key: item.result_media_key, type: item.result_media_type ?? "" } : null);
  }, [item]);

  if (!item) return null;

  const upload = async (file: File) => {
    setUploading(true);
    try {
      setMedia(await api.upload(file));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const patch = {
      result: result.trim() || null,
      pain,
      done: done ? 1 : 0,
      result_media_key: media?.key ?? null,
      result_media_type: media?.type ?? null,
    };
    try {
      await api.patch(`/workouts/${workoutId}/items/${item.id}`, { ...patch, done });
      onSaved(patch);
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose}>
      <div className="stack">
        <div>
          <div className="chip brand">{item.label}</div>
          <h2 style={{ marginTop: 8 }}>{item.name}</h2>
          {item.instructions && <div className="muted pre" style={{ marginTop: 4 }}>{item.instructions}</div>}
        </div>
        <label className="field">
          <span>Your result</span>
          <textarea
            className="textarea"
            placeholder="e.g. 2x12 at 15 lb, felt tight on the left"
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
        </label>
        <div className="field">
          <span>Pain during this exercise</span>
          <PainPicker value={pain} onChange={setPain} />
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          {media ? (
            <div>
              <Media mediaKey={media.key} type={media.type} />
              <button className="btn sm danger" style={{ marginTop: 8 }} onClick={() => setMedia(null)}>
                <Icon name="trash" size={16} /> Remove
              </button>
            </div>
          ) : (
            <button className="btn ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="camera" size={20} /> {uploading ? "Uploading…" : "Add photo or video"}
            </button>
          )}
        </div>
        <label className="card pad row between" style={{ cursor: "pointer" }}>
          <span style={{ fontWeight: 600 }}>Mark this exercise done</span>
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--accent)" }} />
        </label>
        <button className="btn primary lg block" onClick={save} disabled={saving || uploading}>
          Save {item.label}
        </button>
      </div>
    </Sheet>
  );
}

type HistoryRow = {
  id: string;
  result: string | null;
  pain: number | null;
  done: number;
  instructions: string | null;
  result_media_key: string | null;
  result_media_type: string | null;
  scheduled_on: string;
  title: string;
};

export function HistorySheet({
  exercise,
  patientId,
  onClose,
}: {
  exercise: { id: string; name: string } | null;
  patientId?: string;
  onClose: () => void;
}) {
  const path = exercise ? `/exercises/${exercise.id}/history${patientId ? `?patientId=${patientId}` : ""}` : null;
  const { data, loading } = useApi<HistoryRow[]>(path);
  if (!exercise) return null;
  return (
    <Sheet open onClose={onClose}>
      <h2>{exercise.name}</h2>
      <div className="muted small" style={{ marginBottom: 12 }}>Exercise history</div>
      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <div className="faint center" style={{ padding: 24 }}>No results logged yet.</div>
      ) : (
        <div className="list">
          {data.map((h) => (
            <div key={h.id} style={{ padding: "12px 16px" }}>
              <div className="row between small">
                <span style={{ fontWeight: 650 }}>{dayLabel(h.scheduled_on)}</span>
                <span className="faint">{h.title}</span>
              </div>
              {h.instructions && <div className="small muted">Prescribed: {h.instructions}</div>}
              <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                {h.done ? <span className="chip accent">Done</span> : null}
                {h.pain !== null && (
                  <span className="chip" style={{ background: painColor(h.pain), color: "#fff" }}>Pain {h.pain}</span>
                )}
              </div>
              {h.result && <div className="pre" style={{ marginTop: 4 }}>{h.result}</div>}
              {h.result_media_key && <Media mediaKey={h.result_media_key} type={h.result_media_type} />}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export function Comments({ workoutId, comments, onPosted }: { workoutId: string; comments: Comment[]; onPosted: () => void }) {
  const { me } = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/workouts/${workoutId}/comments`, { body: text });
      setText("");
      onPosted();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      {comments.length > 0 && (
        <div className="chat">
          {comments.map((c) => {
            const mine = c.author_id === me.id;
            return (
              <div key={c.id} className="chat">
                <div className={`bubble${mine ? " mine" : ""}`}>{c.body}</div>
                <div className={`bubble-meta${mine ? " mine" : ""}`}>
                  {mine ? "You" : c.author_name} · {relTime(c.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <textarea
          className="textarea grow"
          style={{ minHeight: 48 }}
          placeholder={me.role === "patient" ? "How did it go? Anything to flag?" : "Feedback on this workout"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="icon-btn" style={{ background: "var(--brand)", color: "var(--brand-ink)" }} onClick={post} disabled={busy} aria-label="Post comment">
          <Icon name="send" size={20} />
        </button>
      </div>
    </div>
  );
}
