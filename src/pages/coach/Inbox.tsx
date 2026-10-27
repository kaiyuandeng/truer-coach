import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useApi, useOnFocus } from "../../hooks";
import { dayLabel, relTime } from "../../dates";
import { useSession } from "../../session";
import { Icon } from "../../components/Icon";
import { Empty, Spinner, painColor, toast } from "../../components/ui";
import type { CrmRow } from "./Clients";

type InboxItem = {
  kind: "comment" | "message" | "completed";
  id: string;
  body: string | null;
  created_at: string;
  workout_id: string | null;
  title: string | null;
  scheduled_on: string | null;
  pain_after: number | null;
  patient_id: string;
  patient_name: string;
};

const QUICK = ["Great work! 💪", "Nice. Keep the tempo slow on the way down.", "How did that feel the next morning?", "Let's back off a little next session.", "Love it. Same again next time."];

export function Kpis({ rows }: { rows: CrmRow[] | null }) {
  if (!rows) return null;
  const active = rows.filter((r) => r.stage === "active");
  const mrr = active.reduce((s, r) => s + (r.monthly_rate ?? 0), 0);
  const avgEng = active.length ? Math.round(active.reduce((s, r) => s + r.engagement, 0) / active.length) : 0;
  const atRisk = active.filter((r) => r.churn_risk === "high").length;
  const pipeline = rows.filter((r) => r.stage === "lead" || r.stage === "consult").length;
  return (
    <div className="kpis">
      <div className="kpi"><div className="l">Active clients</div><div className="v">{active.length}</div></div>
      <div className="kpi"><div className="l">Monthly revenue</div><div className="v">${mrr.toLocaleString()}</div></div>
      <div className="kpi"><div className="l">Avg engagement</div><div className="v">{avgEng}</div></div>
      <div className="kpi"><div className="l">At risk</div><div className="v" style={{ color: atRisk ? "var(--danger)" : undefined }}>{atRisk}</div></div>
      <div className="kpi"><div className="l">In pipeline</div><div className="v">{pipeline}</div></div>
    </div>
  );
}

/** The coach's daily queue: every comment, message and fresh completion that hasn't had a reply. */
export function Inbox() {
  const { me, refreshUnread } = useSession();
  const inbox = useApi<InboxItem[]>("/inbox");
  const crm = useApi<CrmRow[]>("/crm");
  useOnFocus(inbox.reload);

  const atRisk = (crm.data ?? []).filter((r) => r.churn_risk === "high");
  const followUps = (crm.data ?? []).filter((r) => r.follow_up_on && r.follow_up_on <= new Date().toISOString().slice(0, 10));

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {me.name.split(" ")[0]}</h1>
      <div className="muted" style={{ marginBottom: 20 }}>
        {inbox.data ? `${inbox.data.length} thing${inbox.data.length === 1 ? "" : "s"} waiting on you` : " "}
      </div>
      <Kpis rows={crm.data} />

      <div className="grid inbox-grid">
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>Inbox</div>
          {inbox.loading && !inbox.data ? (
            <Spinner />
          ) : !inbox.data?.length ? (
            <div className="card pad"><Empty icon="check" title="Inbox zero">Every comment has a reply. Nice.</Empty></div>
          ) : (
            <div className="card">
              {inbox.data.map((it) => (
                <InboxRow key={it.kind + it.id} it={it} onDone={() => { inbox.reload(); refreshUnread(); }} />
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>Needs attention</div>
          <div className="list">
            {atRisk.map((r) => (
              <Link key={r.id} to={`/clients/${r.id}`} className="list-item">
                <div className="avatar">{r.name[0]}</div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650 }}>{r.name}</div>
                  <div className="tiny muted">{r.risk_reasons.join(" · ")}</div>
                </div>
                <span className="chip risk-high">High risk</span>
              </Link>
            ))}
            {followUps.map((r) => (
              <Link key={"f" + r.id} to={`/clients/${r.id}?tab=profile`} className="list-item">
                <div className="avatar">{r.name[0]}</div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650 }}>{r.name}</div>
                  <div className="tiny muted">Follow up {dayLabel(r.follow_up_on!).toLowerCase()} · {r.stage}</div>
                </div>
                <Icon name="calendar" size={18} />
              </Link>
            ))}
            {!atRisk.length && !followUps.length && <div className="faint small center" style={{ padding: 20 }}>Nothing flagged.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxRow({ it, onDone }: { it: InboxItem; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const first = it.patient_name.split(" ")[0];
  const send = async (body: string) => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      if (it.kind === "message") {
        await api.post("/messages", { patientId: it.patient_id, body });
        await api.post("/inbox/dismiss", { messageId: it.id });
      } else {
        await api.post(`/workouts/${it.workout_id}/comments`, { body });
      }
      toast(`Replied to ${it.patient_name.split(" ")[0]}`);
      onDone();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };
  const dismiss = async () => {
    if (it.kind === "comment") await api.post("/inbox/dismiss", { commentId: it.id });
    else if (it.kind === "message") await api.post("/inbox/dismiss", { messageId: it.id });
    onDone();
  };
  return (
    <div className={`inbox-item${open ? " open" : ""}`}>
      <div className="avatar">{it.patient_name[0]}</div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row between">
          <div className="small">
            <Link to={`/clients/${it.patient_id}`} style={{ fontWeight: 700, color: "var(--text)" }}>{it.patient_name}</Link>{" "}
            <span className="muted">
              {it.kind === "message" ? "sent a message" : it.kind === "comment" ? "commented on " : "completed "}
              {it.workout_id && <Link to={`/workouts/${it.workout_id}`}>{it.title}</Link>}
              {it.scheduled_on && it.kind !== "message" ? ` (${dayLabel(it.scheduled_on).toLowerCase()})` : ""}
            </span>
          </div>
          <span className="tiny faint" style={{ flex: "none" }}>{relTime(it.created_at)}</span>
        </div>
        {it.body && <div className="bubble" style={{ marginTop: 6, maxWidth: "100%", boxShadow: "none", background: "var(--surface-2)" }}>{it.body}</div>}
        {it.pain_after !== null && (
          <span className="chip" style={{ background: painColor(it.pain_after), color: "#fff", marginTop: 6 }}>Pain after: {it.pain_after}/10</span>
        )}
        {open ? (
          <>
            <div className="quick-replies">
              {QUICK.map((q) => (
                <button key={q} disabled={busy} onClick={() => send(q)}>{q}</button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
              <textarea
                className="textarea grow"
                autoFocus
                style={{ minHeight: 40, padding: "8px 12px" }}
                placeholder={`Reply to ${first}…`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(text);
                  if (e.key === "Escape") setOpen(false);
                }}
              />
              <button className="btn primary sm" disabled={busy || !text.trim()} onClick={() => send(text)}>Send</button>
              <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="inbox-actions">
            <button className="btn sm primary" onClick={() => setOpen(true)}><Icon name="send" size={14} /> Reply</button>
            <button className="btn sm" disabled={busy} onClick={() => send(QUICK[0])} title="Send a quick “Great work!”">👏 Great work</button>
            {it.kind !== "completed" && <button className="btn sm ghost" disabled={busy} onClick={dismiss} title="Mark handled without replying">Mark handled</button>}
          </div>
        )}
      </div>
    </div>
  );
}
