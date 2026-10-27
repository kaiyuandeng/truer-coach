import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useApi, useOnFocus } from "../../hooks";
import { dayLabel, relTime } from "../../dates";
import { Icon } from "../../components/Icon";
import { Empty, Sheet, Spinner, toast } from "../../components/ui";
import { Grid, f1, pct } from "../../components/Grid";
import { Kpis } from "./Inbox";
import { Onboarding } from "./Onboarding";

export type Stage = "lead" | "consult" | "active" | "paused" | "churned";

export type CrmRow = {
  id: string;
  name: string;
  email: string | null;
  diagnosis: string | null;
  stage: Stage;
  stage_changed_at: string;
  source: string | null;
  phone: string | null;
  monthly_rate: number | null;
  follow_up_on: string | null;
  invite_code: string | null;
  created_at: string;
  pipeline_step: string | null;
  scheduled_14d: number;
  completed_14d: number;
  last_active_at: string | null;
  last_scheduled_on: string | null;
  pain_14d: number | null;
  engagement: number;
  adherence_14d: number | null;
  days_quiet: number | null;
  churn_risk: "high" | "medium" | "low" | null;
  risk_reasons: string[];
};

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "lead", label: "Lead", hint: "New or pitch call" },
  { id: "consult", label: "Onboarding", hint: "Needs call or deciding" },
  { id: "active", label: "Active", hint: "Training now" },
  { id: "paused", label: "Paused", hint: "Taking a break" },
  { id: "churned", label: "Churned", hint: "Finished or left" },
];

export function inviteLink(code: string) {
  return `${location.origin}/join/${code}`;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function Clients() {
  const nav = useNavigate();
  const { data, setData, loading, reload } = useApi<CrmRow[]>("/crm");
  const [view, setView] = useState<"pipeline" | "table" | "past">("table");
  const [adding, setAdding] = useState<Stage | null>(null);
  const [rev, setRev] = useState(0);
  useOnFocus(reload);

  const riskRank = { high: 0, medium: 1, low: 2 } as const;
  const active = (data ?? []).filter((r) => r.stage === "active");

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <h1>Clients</h1>
        <div className="row">
          <div className="segmented" style={{ width: 300 }}>
            <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Active</button>
            <button className={view === "pipeline" ? "on" : ""} onClick={() => setView("pipeline")}>Onboarding</button>
            <button className={view === "past" ? "on" : ""} onClick={() => setView("past")}>Past</button>
          </div>
          <button className="btn primary" onClick={() => setAdding(view === "pipeline" ? "lead" : "active")}>
            <Icon name="plus" size={18} /> {view === "pipeline" ? "Add lead" : "Add client"}
          </button>
        </div>
      </div>
      <Kpis rows={data} />

      {loading && !data ? (
        <Spinner />
      ) : view === "pipeline" ? (
        <Onboarding key={rev} />
      ) : view === "past" ? (
        <PastClients rows={(data ?? []).filter((r) => (r.stage === "paused" || r.stage === "churned") && r.pipeline_step !== "lost")} />
      ) : !active.length ? (
        <div className="card pad"><Empty icon="users" title="No active clients">Add a client and send them their invite link.</Empty></div>
      ) : (
        <Grid
          rows={active}
          rowKey={(r) => r.id}
          onRowClick={(r) => nav(`/clients/${r.id}`)}
          initialSort={{ key: "risk", dir: 1 }}
          cols={[
            { key: "name", label: "Client", render: (r) => <b style={{ fontWeight: 500 }}>{r.name}</b>, sort: (r) => r.name },
            { key: "dx", label: "Diagnosis", render: (r) => <span className="ellipsis" style={{ display: "inline-block", maxWidth: 260, verticalAlign: "bottom" }}>{r.diagnosis ?? ""}</span>, sort: (r) => r.diagnosis },
            { key: "eng", label: "Eng", num: true, title: "Engagement score, 0–100", render: (r) => r.engagement, sort: (r) => r.engagement, tone: (r) => (r.engagement < 45 ? "bad" : r.engagement < 70 ? "meh" : "") },
            { key: "adh", label: "Adh 14d", num: true, render: (r) => pct(r.adherence_14d), sort: (r) => r.adherence_14d, tone: (r) => (r.adherence_14d === null ? "" : r.adherence_14d < 0.5 ? "bad" : r.adherence_14d < 0.7 ? "meh" : "") },
            { key: "done", label: "Done/plan", num: true, render: (r) => (r.scheduled_14d ? `${r.completed_14d}/${r.scheduled_14d}` : "–"), sort: (r) => r.completed_14d },
            { key: "pain", label: "Pain", num: true, render: (r) => f1(r.pain_14d), sort: (r) => r.pain_14d, tone: (r) => (r.pain_14d !== null && r.pain_14d >= 7 ? "bad" : "") },
            { key: "quiet", label: "Last active", num: true, render: (r) => (r.last_active_at ? relTime(r.last_active_at) : r.invite_code ? "Invite pending" : "Never"), sort: (r) => r.days_quiet, tone: (r) => (r.days_quiet !== null && r.days_quiet >= 5 ? "bad" : "") },
            { key: "src", label: "Source", render: (r) => r.source ?? "", sort: (r) => r.source },
            { key: "rate", label: "$/mo", num: true, render: (r) => (r.monthly_rate ? `$${r.monthly_rate}` : ""), sort: (r) => r.monthly_rate },
            { key: "risk", label: "Churn risk", render: (r) => (r.churn_risk ? <span className={`tag s-${r.churn_risk === "high" ? "risk" : r.churn_risk === "medium" ? "nudge" : "track"}`}>{r.churn_risk[0].toUpperCase() + r.churn_risk.slice(1)}</span> : ""), sort: (r) => riskRank[r.churn_risk ?? "low"] },
            { key: "why", label: "Why", render: (r) => <span className="muted">{r.risk_reasons.join(" · ")}</span> },
          ]}
          foot={[
            `${active.length} clients`,
            "",
            Math.round(active.reduce((s, r) => s + r.engagement, 0) / active.length),
            pct(avg(active.flatMap((r) => (r.adherence_14d === null ? [] : [r.adherence_14d])))),
            `${active.reduce((s, r) => s + r.completed_14d, 0)}/${active.reduce((s, r) => s + r.scheduled_14d, 0)}`,
            f1(avg(active.flatMap((r) => (r.pain_14d === null ? [] : [r.pain_14d])))),
            "",
            "",
            `$${active.reduce((s, r) => s + (r.monthly_rate ?? 0), 0).toLocaleString()}`,
            `${active.filter((r) => r.churn_risk === "high").length} high`,
            "",
          ]}
        />
      )}

      {adding && <AddClient stage={adding} onClose={() => setAdding(null)} onAdded={() => { reload(); setRev((n) => n + 1); }} />}
    </div>
  );
}

function PastClients({ rows }: { rows: CrmRow[] }) {
  const nav = useNavigate();
  if (!rows.length) return <div className="card pad"><Empty icon="users" title="No past clients">Paused and finished clients show up here.</Empty></div>;
  return (
    <div className="list">
      {[...rows].sort((a, b) => b.stage_changed_at.localeCompare(a.stage_changed_at)).map((r) => (
        <div key={r.id} className="list-item click" onClick={() => nav(`/clients/${r.id}`)}>
          <div className="avatar">{r.name[0]}</div>
          <div className="grow">
            <div style={{ fontWeight: 650 }}>{r.name}</div>
            <div className="tiny muted ellipsis">{r.diagnosis}</div>
          </div>
          {r.follow_up_on && <span className="tiny" style={{ color: r.follow_up_on <= new Date().toISOString().slice(0, 10) ? "var(--danger)" : "var(--text-3)" }}>Follow up {dayLabel(r.follow_up_on).toLowerCase()}</span>}
          <span className="chip">{r.stage === "paused" ? "Paused" : "Finished"} {relTime(r.stage_changed_at)}</span>
        </div>
      ))}
    </div>
  );
}

function AddClient({ stage, onClose, onAdded }: { stage: Stage; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: "", diagnosis: "", source: "", monthly_rate: "", stage: stage as string });
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ id: string; invite_code: string }>("/patients", form);
      onAdded();
      if (form.stage === "active") setCode(r.invite_code);
      else onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      {code ? (
        <InviteShare name={form.name} code={code} onDone={onClose} />
      ) : (
        <div className="stack">
          <h2>{form.stage === "lead" || form.stage === "consult" ? "Add lead" : "Add client"}</h2>
          <label className="field"><span>Name</span><input className="input" value={form.name} onChange={set("name")} autoFocus /></label>
          <label className="field"><span>Diagnosis or focus</span><input className="input" value={form.diagnosis} onChange={set("diagnosis")} placeholder="e.g. Plantar fasciitis, ankle mobility" /></label>
          <div className="row">
            <label className="field grow"><span>Stage</span>
              <select className="input" value={form.stage} onChange={set("stage")}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className="field grow"><span>Source</span><input className="input" value={form.source} onChange={set("source")} placeholder="Referral, Instagram…" /></label>
            <label className="field" style={{ width: 120 }}><span>$/month</span><input className="input" inputMode="numeric" value={form.monthly_rate} onChange={set("monthly_rate")} /></label>
          </div>
          <button className="btn primary block" disabled={!form.name.trim() || busy} onClick={create}>
            {form.stage === "active" ? "Create and get invite link" : "Add to pipeline"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

export function InviteShare({ name, code, onDone }: { name: string; code: string; onDone?: () => void }) {
  const link = inviteLink(code);
  const share = async () => {
    const text = `Hi ${name.split(" ")[0]}, here's your link to your exercise program: ${link}`;
    if (navigator.share) await navigator.share({ text }).catch(() => {});
    else {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    }
  };
  return (
    <div className="stack">
      <h2>Invite {name}</h2>
      <p className="muted" style={{ margin: 0 }}>Send this link. They open it on their phone, pick a password, and they're in.</p>
      <div className="card pad row" style={{ gap: 8 }}>
        <Icon name="link" size={18} />
        <code className="grow ellipsis small">{link}</code>
      </div>
      <div className="row">
        <button className="btn grow" onClick={async () => { await navigator.clipboard.writeText(link); toast("Link copied"); }}>
          <Icon name="copy" size={18} /> Copy
        </button>
        <button className="btn primary grow" onClick={share}>Share</button>
      </div>
      {onDone && <button className="btn ghost block" onClick={onDone}>Done</button>}
    </div>
  );
}
