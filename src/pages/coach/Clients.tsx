import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useApi, useOnFocus } from "../../hooks";
import { dayLabel, relTime } from "../../dates";
import { Icon } from "../../components/Icon";
import { Empty, Sheet, Spinner, painColor, toast } from "../../components/ui";
import { Kpis } from "./Inbox";

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
  { id: "lead", label: "Leads", hint: "Interested, not booked" },
  { id: "consult", label: "Consult", hint: "Assessment booked" },
  { id: "active", label: "Active", hint: "Training now" },
  { id: "paused", label: "Paused", hint: "Taking a break" },
  { id: "churned", label: "Churned", hint: "Finished or left" },
];

export function inviteLink(code: string) {
  return `${location.origin}/join/${code}`;
}

function engColor(n: number) {
  return n >= 70 ? "var(--accent)" : n >= 45 ? "#e8b33f" : "var(--danger)";
}

export function Clients() {
  const nav = useNavigate();
  const { data, setData, loading, reload } = useApi<CrmRow[]>("/crm");
  const [view, setView] = useState<"pipeline" | "table">("table");
  const [adding, setAdding] = useState<Stage | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [sort, setSort] = useState<"risk" | "engagement" | "name">("risk");
  useOnFocus(reload);

  const moveTo = async (id: string, stage: Stage) => {
    setData((cur) => cur?.map((r) => (r.id === id ? { ...r, stage } : r)) ?? cur);
    try {
      await api.patch(`/patients/${id}`, { stage });
      reload();
    } catch (e) {
      toast((e as Error).message);
      reload();
    }
  };

  const riskRank = { high: 0, medium: 1, low: 2 } as const;
  const active = (data ?? [])
    .filter((r) => r.stage === "active")
    .sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "engagement" ? b.engagement - a.engagement : riskRank[a.churn_risk ?? "low"] - riskRank[b.churn_risk ?? "low"] || a.engagement - b.engagement,
    );

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <h1>Clients</h1>
        <div className="row">
          <div className="segmented" style={{ width: 220 }}>
            <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Active</button>
            <button className={view === "pipeline" ? "on" : ""} onClick={() => setView("pipeline")}>Pipeline</button>
          </div>
          <button className="btn primary" onClick={() => setAdding(view === "pipeline" ? "lead" : "active")}>
            <Icon name="plus" size={18} /> Add client
          </button>
        </div>
      </div>
      <Kpis rows={data} />

      {loading && !data ? (
        <Spinner />
      ) : view === "pipeline" ? (
        <div className="pipeline">
          {STAGES.map((s) => {
            const rows = (data ?? []).filter((r) => r.stage === s.id);
            const value = rows.reduce((n, r) => n + (r.monthly_rate ?? 0), 0);
            return (
              <div
                key={s.id}
                className={`stage-col${overStage === s.id ? " drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(s.id);
                }}
                onDragLeave={() => setOverStage(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  const id = e.dataTransfer.getData("text/client");
                  if (id) moveTo(id, s.id);
                }}
              >
                <div className="stage-head">
                  <span>{s.label} <span className="faint">{rows.length}</span></span>
                  {value > 0 && <span className="faint tiny">${value.toLocaleString()}/mo</span>}
                </div>
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="deal"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/client", r.id)}
                    onClick={() => nav(`/clients/${r.id}${r.stage === "active" ? "" : "?tab=profile"}`)}
                  >
                    <div className="row between">
                      <b>{r.name}</b>
                      {r.churn_risk && r.churn_risk !== "low" && <span className={`chip risk-${r.churn_risk}`} style={{ fontSize: 11, padding: "1px 7px" }}>{r.churn_risk}</span>}
                    </div>
                    {r.diagnosis && <div className="tiny muted ellipsis">{r.diagnosis}</div>}
                    <div className="row tiny faint" style={{ marginTop: 6, gap: 8, flexWrap: "wrap" }}>
                      {r.source && <span>{r.source}</span>}
                      {r.monthly_rate ? <span>${r.monthly_rate}/mo</span> : null}
                      {r.follow_up_on && <span style={{ color: r.follow_up_on <= new Date().toISOString().slice(0, 10) ? "var(--danger)" : undefined }}>Follow up {dayLabel(r.follow_up_on).toLowerCase()}</span>}
                    </div>
                    {r.stage === "active" && (
                      <div className="meter" style={{ marginTop: 8 }} title={`Engagement ${r.engagement}`}>
                        <div style={{ width: `${r.engagement}%`, background: engColor(r.engagement) }} />
                      </div>
                    )}
                  </div>
                ))}
                <button className="btn sm ghost block" onClick={() => setAdding(s.id)}><Icon name="plus" size={14} /> Add</button>
              </div>
            );
          })}
        </div>
      ) : !active.length ? (
        <div className="card pad"><Empty icon="users" title="No active clients">Add a client and send them their invite link.</Empty></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th><button className="btn sm ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => setSort("name")}>Client</button></th>
                <th><button className="btn sm ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => setSort("engagement")}>Engagement</button></th>
                <th>Last 14 days</th>
                <th>Pain</th>
                <th>Last active</th>
                <th><button className="btn sm ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => setSort("risk")}>Churn risk</button></th>
              </tr>
            </thead>
            <tbody>
              {active.map((r) => (
                <tr key={r.id} className="click" onClick={() => nav(`/clients/${r.id}`)}>
                  <td>
                    <div className="row">
                      <div className="avatar">{r.name[0]}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 650 }}>{r.name}</div>
                        <div className="tiny faint ellipsis" style={{ maxWidth: 260 }}>{r.diagnosis}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ minWidth: 130 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <b style={{ width: 26 }}>{r.engagement}</b>
                      <div className="meter grow"><div style={{ width: `${r.engagement}%`, background: engColor(r.engagement) }} /></div>
                    </div>
                  </td>
                  <td>{r.scheduled_14d ? <><b>{r.completed_14d}</b><span className="faint">/{r.scheduled_14d} done</span></> : <span className="faint">–</span>}</td>
                  <td>{r.pain_14d !== null ? <span className="chip" style={{ background: painColor(r.pain_14d), color: "#fff" }}>{r.pain_14d.toFixed(1)}</span> : <span className="faint">–</span>}</td>
                  <td className="small">{r.last_active_at ? relTime(r.last_active_at) : <span className="faint">{r.invite_code ? "Invite pending" : "Never"}</span>}</td>
                  <td>
                    {r.churn_risk && <span className={`chip risk-${r.churn_risk}`}>{r.churn_risk[0].toUpperCase() + r.churn_risk.slice(1)}</span>}
                    {r.risk_reasons.length > 0 && <div className="tiny muted" style={{ marginTop: 4 }}>{r.risk_reasons.join(" · ")}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddClient stage={adding} onClose={() => setAdding(null)} onAdded={reload} />}
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
          <h2>Add client</h2>
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
