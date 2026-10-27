import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useApi, useOnFocus } from "../../hooks";
import { dayLabel, relTime, ymd } from "../../dates";
import { Icon } from "../../components/Icon";
import { Sheet, Spinner, toast } from "../../components/ui";
import { InviteShare } from "./Clients";

/** Evan's onboarding: a 15 minute pitch call, a 1 hour needs call, then the client decides. */
export type Step = "new" | "pitch" | "needs" | "decision" | "won" | "lost";

export type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  diagnosis: string | null;
  notes: string | null;
  source: string | null;
  monthly_rate: number | null;
  follow_up_on: string | null;
  invite_code: string | null;
  created_at: string;
  step: Step;
  step_changed_at: string;
  pitch_at: string | null;
  pitch_done_at: string | null;
  needs_at: string | null;
  needs_done_at: string | null;
  decided_at: string | null;
  lost_reason: string | null;
  crm_provider: string | null;
};

type Funnel = {
  leads: number;
  pitched: number;
  needs: number;
  won: number;
  lost: number;
  pitch_rate: number | null;
  needs_rate: number | null;
  close_rate: number | null;
  win_rate: number | null;
  days_to_sign: number | null;
};

type Provider = { id: string; label: string; blurb: string; ready: boolean };
type ImportRun = { id: string; provider: string; created_count: number; updated_count: number; skipped_count: number; created_at: string };
type PipelineData = { leads: Lead[]; funnel: Funnel; imports: ImportRun[]; providers: Provider[] };

const COLUMNS: { id: Step; label: string; hint: string }[] = [
  { id: "new", label: "New lead", hint: "Book a pitch call" },
  { id: "pitch", label: "Pitch call", hint: "15 min" },
  { id: "needs", label: "Needs call", hint: "1 hour" },
  { id: "decision", label: "Deciding", hint: "Waiting on them" },
];

const sqlDate = (s: string) => new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
const daysSince = (s: string) => Math.max(0, Math.floor((Date.now() - sqlDate(s).getTime()) / 86400_000));

/** "Tomorrow 10:00 AM" for a local "YYYY-MM-DDTHH:MM" call time. */
export function callLabel(at: string) {
  const time = new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dayLabel(at.slice(0, 10))} ${time}`;
}

const callPast = (at: string | null) => !!at && new Date(at).getTime() < Date.now();
const providerLabel = (id: string | null, providers: Provider[]) =>
  !id ? null : providers.find((p) => p.id === id)?.label ?? (id === "csv" ? "CSV import" : id);

/** What the coach should do next with this lead, shown on the card. */
function nextAction(l: Lead): { text: string; tone?: "due" | "soon" } {
  if (l.step === "new") return { text: "Book pitch call", tone: "due" };
  if (l.step === "pitch")
    return !l.pitch_at ? { text: "Book pitch call", tone: "due" } : callPast(l.pitch_at) ? { text: `Pitch was ${callLabel(l.pitch_at)}`, tone: "due" } : { text: `Pitch ${callLabel(l.pitch_at)}`, tone: "soon" };
  if (l.step === "needs")
    return !l.needs_at ? { text: "Book needs call", tone: "due" } : callPast(l.needs_at) ? { text: `Needs call was ${callLabel(l.needs_at)}`, tone: "due" } : { text: `Needs call ${callLabel(l.needs_at)}`, tone: "soon" };
  if (l.step === "decision")
    return l.follow_up_on ? { text: `Follow up ${dayLabel(l.follow_up_on).toLowerCase()}`, tone: l.follow_up_on <= ymd() ? "due" : undefined } : { text: `Deciding for ${daysSince(l.step_changed_at)}d` };
  return { text: "" };
}

export function Onboarding() {
  const { data, setData, loading, reload } = useApi<PipelineData>("/pipeline");
  const [open, setOpen] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [over, setOver] = useState<Step | null>(null);
  useOnFocus(reload);

  const move = async (id: string, step: Step) => {
    setData((d) => d && { ...d, leads: d.leads.map((l) => (l.id === id ? { ...l, step, step_changed_at: new Date().toISOString() } : l)) });
    try {
      await api.patch(`/pipeline/${id}`, { step });
    } catch (e) {
      toast((e as Error).message);
    }
    reload();
  };

  if (loading && !data) return <Spinner />;
  if (!data) return null;
  const leads = data.leads;
  const recent = leads
    .filter((l) => (l.step === "won" || l.step === "lost") && l.decided_at && daysSince(l.decided_at) <= 30)
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  const lead = leads.find((l) => l.id === open);

  return (
    <div>
      <FunnelStrip f={data.funnel} open={leads.filter((l) => COLUMNS.some((c) => c.id === l.step))} />

      <div className="row between" style={{ margin: "4px 0 12px", flexWrap: "wrap" }}>
        <div className="small muted">
          {data.imports[0] ? <>Last CRM import {relTime(data.imports[0].created_at)} from {providerLabel(data.imports[0].provider, data.providers)}</> : "Bring in leads from the CRM you use today."}
        </div>
        <button className="btn sm" onClick={() => setImporting(true)}><Icon name="link" size={16} /> Import from CRM</button>
      </div>

      <div className="pipeline onboarding">
        {COLUMNS.map((col) => {
          const rows = leads.filter((l) => l.step === col.id);
          const value = rows.reduce((n, l) => n + (l.monthly_rate ?? 0), 0);
          return (
            <div
              key={col.id}
              className={`stage-col${over === col.id ? " drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/lead");
                if (id && leads.find((l) => l.id === id)?.step !== col.id) move(id, col.id);
              }}
            >
              <div className="stage-head">
                <span>{col.label} <span className="faint">{rows.length}</span></span>
                <span className="faint tiny" style={{ textTransform: "none", letterSpacing: 0 }}>{value > 0 ? `$${value.toLocaleString()}/mo` : col.hint}</span>
              </div>
              {rows.map((l) => {
                const next = nextAction(l);
                const crm = providerLabel(l.crm_provider, data.providers);
                return (
                  <div key={l.id} className="deal" draggable onDragStart={(e) => e.dataTransfer.setData("text/lead", l.id)} onClick={() => setOpen(l.id)}>
                    <div className="row between">
                      <b className="ellipsis">{l.name}</b>
                      {l.monthly_rate ? <span className="tiny faint">${l.monthly_rate}</span> : null}
                    </div>
                    {l.diagnosis && <div className="tiny muted ellipsis">{l.diagnosis}</div>}
                    <div className={`next-action ${next.tone ?? ""}`}>
                      <Icon name={next.tone === "soon" ? "calendar" : l.step === "decision" ? "history" : "plus"} size={13} /> {next.text}
                    </div>
                    <div className="row tiny faint" style={{ marginTop: 6, gap: 6, flexWrap: "wrap" }}>
                      {l.source && <span>{l.source}</span>}
                      {crm && <span className="crm-tag">{crm}</span>}
                      <span style={{ marginLeft: "auto" }}>{daysSince(l.step_changed_at)}d</span>
                    </div>
                  </div>
                );
              })}
              {!rows.length && <div className="tiny faint center" style={{ padding: "18px 8px" }}>{col.id === "new" ? "No new leads" : "Nobody here"}</div>}
            </div>
          );
        })}
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-title">Decided in the last 30 days</div>
          <div className="list">
            {recent.map((l) => (
              <div key={l.id} className="list-item click" onClick={() => setOpen(l.id)}>
                <div className="avatar">{l.name[0]}</div>
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>{l.name}</div>
                  <div className="tiny muted ellipsis">{l.step === "lost" ? l.lost_reason ?? "Didn't sign" : l.diagnosis}</div>
                </div>
                <span className={`chip ${l.step === "won" ? "risk-low" : "risk-high"}`}>{l.step === "won" ? "Signed" : "Lost"}</span>
                <span className="tiny faint" style={{ width: 56, textAlign: "right" }}>{relTime(l.decided_at!)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {lead && <LeadSheet lead={lead} providers={data.providers} onClose={() => setOpen(null)} onChanged={reload} />}
      {importing && <ImportSheet data={data} onClose={() => setImporting(false)} onDone={reload} />}
    </div>
  );
}

function FunnelStrip({ f, open }: { f: Funnel; open: Lead[] }) {
  const value = open.reduce((n, l) => n + (l.monthly_rate ?? 0), 0);
  const steps = [
    { label: "Leads", n: f.leads, rate: null },
    { label: "Pitch call", n: f.pitched, rate: f.pitch_rate },
    { label: "Needs call", n: f.needs, rate: f.needs_rate },
    { label: "Signed", n: f.won, rate: f.close_rate },
  ];
  const max = Math.max(1, f.leads);
  return (
    <div className="card pad funnel">
      <div className="funnel-steps">
        {steps.map((s, i) => (
          <div key={s.label} className="funnel-step">
            <div className="l">{s.label}</div>
            <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
              <span className="v">{s.n}</span>
              {s.rate !== null && <span className="tiny muted">{s.rate}%</span>}
            </div>
            <div className="funnel-bar"><div style={{ width: `${(s.n / max) * 100}%`, opacity: 1 - i * 0.18 }} /></div>
          </div>
        ))}
      </div>
      <div className="funnel-side">
        <div><span className="l">Win rate</span><b>{f.win_rate !== null ? `${f.win_rate}%` : "–"}</b></div>
        <div><span className="l">Lead to client</span><b>{f.days_to_sign !== null ? `${f.days_to_sign} days` : "–"}</b></div>
        <div><span className="l">Open pipeline</span><b>{value ? `$${value.toLocaleString()}/mo` : "–"}</b></div>
      </div>
      <div className="tiny faint funnel-note">Leads added in the last 90 days. Rates are the share who made it from the step before.</div>
    </div>
  );
}

const PROGRESS: { step: Step; label: string }[] = [
  { step: "pitch", label: "Pitch call" },
  { step: "needs", label: "Needs call" },
  { step: "decision", label: "Decision" },
];

function LeadSheet({ lead: l, providers, onClose, onChanged }: { lead: Lead; providers: Provider[]; onClose: () => void; onChanged: () => void }) {
  const nav = useNavigate();
  const [pitchAt, setPitchAt] = useState(l.pitch_at ?? "");
  const [needsAt, setNeedsAt] = useState(l.needs_at ?? "");
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (patch: Record<string, unknown>, msg?: string) => {
    setBusy(true);
    try {
      const r = await api.patch<{ invite_code: string | null }>(`/pipeline/${l.id}`, patch);
      onChanged();
      if (msg) toast(msg);
      return r;
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (invite) return <Sheet open onClose={onClose}><InviteShare name={l.name} code={invite} onDone={onClose} /></Sheet>;

  const reached = (s: Step) =>
    s === "pitch" ? !!l.pitch_done_at || l.step === "won" : s === "needs" ? !!l.needs_done_at || l.step === "won" : !!l.decided_at;
  const current = l.step === "new" ? "pitch" : l.step;
  const crm = providerLabel(l.crm_provider, providers);

  return (
    <Sheet open onClose={onClose}>
      <div className="stack">
        <div className="row between">
          <div style={{ minWidth: 0 }}>
            <h2 className="ellipsis">{l.name}</h2>
            {l.diagnosis && <div className="small muted">{l.diagnosis}</div>}
          </div>
          {l.monthly_rate ? <span className="chip brand">${l.monthly_rate}/mo</span> : null}
        </div>

        <div className="lead-progress">
          {PROGRESS.map((p) => (
            <div key={p.step} className={`${reached(p.step) ? "done" : ""} ${current === p.step ? "now" : ""}`}>
              <span className="dot">{reached(p.step) ? <Icon name="check" size={12} /> : null}</span>
              {p.label}
            </div>
          ))}
        </div>

        <div className="small muted row" style={{ flexWrap: "wrap", gap: "4px 14px" }}>
          {l.email && <a href={`mailto:${l.email}`}>{l.email}</a>}
          {l.phone && <a href={`tel:${l.phone}`}>{l.phone}</a>}
          {l.source && <span>Source: {l.source}</span>}
          {crm && <span>From {crm}</span>}
          <span>Added {relTime(l.created_at)}</span>
        </div>
        {l.notes && <div className="card pad small pre" style={{ background: "var(--surface-2)", boxShadow: "none" }}>{l.notes}</div>}

        {(l.step === "new" || l.step === "pitch") && (
          <div className="stack" style={{ gap: 8 }}>
            <label className="field"><span>Pitch call · 15 min</span>
              <input className="input" type="datetime-local" value={pitchAt} onChange={(e) => setPitchAt(e.target.value)} />
            </label>
            <div className="row">
              <button className="btn grow" disabled={busy || !pitchAt || (pitchAt === l.pitch_at && l.step === "pitch")} onClick={() => save({ pitch_at: pitchAt, step: "pitch" }, "Pitch call booked")}>
                <Icon name="calendar" size={16} /> {l.pitch_at ? "Reschedule" : "Book pitch call"}
              </button>
              {l.step === "pitch" && (
                <button className="btn primary grow" disabled={busy} onClick={() => save({ step: "needs" }, "On to the needs call")}>
                  Pitch done <Icon name="chev" size={16} />
                </button>
              )}
            </div>
          </div>
        )}

        {l.step === "needs" && (
          <div className="stack" style={{ gap: 8 }}>
            <label className="field"><span>Needs call · 1 hour</span>
              <input className="input" type="datetime-local" value={needsAt} onChange={(e) => setNeedsAt(e.target.value)} />
            </label>
            <div className="row">
              <button className="btn grow" disabled={busy || !needsAt || needsAt === l.needs_at} onClick={() => save({ needs_at: needsAt }, "Needs call booked")}>
                <Icon name="calendar" size={16} /> {l.needs_at ? "Reschedule" : "Book needs call"}
              </button>
              <button className="btn primary grow" disabled={busy} onClick={() => save({ step: "decision" }, "Waiting on their decision")}>
                Needs call done <Icon name="chev" size={16} />
              </button>
            </div>
          </div>
        )}

        {l.step === "decision" && !losing && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="small muted">They've had both calls. Did they decide to start?</div>
            <div className="row">
              <button className="btn grow" disabled={busy} onClick={() => setLosing(true)}>Not right now</button>
              <button
                className="btn accent grow"
                disabled={busy}
                onClick={async () => {
                  const r = await save({ step: "won" });
                  if (r?.invite_code) setInvite(r.invite_code);
                  else if (r) onClose();
                }}
              >
                <Icon name="trophy" size={16} /> Signed up
              </button>
            </div>
          </div>
        )}

        {losing && (
          <div className="stack" style={{ gap: 8 }}>
            <label className="field"><span>What held them back? (optional)</span>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Price, timing, chose someone else…" autoFocus />
            </label>
            <div className="row">
              <button className="btn grow" onClick={() => setLosing(false)}>Back</button>
              <button className="btn danger grow" disabled={busy} onClick={async () => (await save({ step: "lost", lost_reason: reason }, "Marked as lost")) && onClose()}>Mark lost</button>
            </div>
          </div>
        )}

        {l.step === "won" && <div className="card pad small" style={{ background: "var(--accent-soft)", boxShadow: "none" }}>Signed up {l.decided_at ? relTime(l.decided_at) : ""}. They're on your active client list now.</div>}
        {l.step === "lost" && (
          <div className="row between card pad small" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
            <span>Didn't sign{l.lost_reason ? `: ${l.lost_reason}` : ""}</span>
            <button className="btn sm" disabled={busy} onClick={() => save({ step: "decision" }, "Reopened")}>Reopen</button>
          </div>
        )}

        <button className="btn ghost block" onClick={() => nav(`/clients/${l.id}${l.step === "won" ? "" : "?tab=profile"}`)}>Open full profile</button>
      </div>
    </Sheet>
  );
}

function ImportSheet({ data, onClose, onDone }: { data: PipelineData; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  const run = async (key: string, path: string, payload: unknown) => {
    setBusy(key);
    try {
      const r = await api.post<{ created: number; updated: number; skipped: number }>(path, payload);
      setResult(r);
      onDone();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose}>
      <div className="stack">
        <h2>Import leads</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Leads land in New lead, or further along if your CRM says they've already had a call. Importing again updates the same people instead of adding duplicates.
        </p>
        {result && (
          <div className="card pad small" style={{ background: "var(--accent-soft)", boxShadow: "none" }}>
            <b>{result.created} new</b>, {result.updated} updated, {result.skipped} unchanged or skipped.
          </div>
        )}
        <div className="list">
          {data.providers.map((p) => (
            <div key={p.id} className="list-item">
              <div className="avatar">{p.label[0]}</div>
              <div className="grow">
                <div style={{ fontWeight: 650 }}>{p.label}</div>
                <div className="tiny muted">{p.ready ? p.blurb : `${p.blurb} · not connected yet`}</div>
              </div>
              <button className={`btn sm ${p.ready ? "primary" : ""}`} disabled={!p.ready || !!busy} onClick={() => run(p.id, "/pipeline/import", { provider: p.id })}>
                {busy === p.id ? "Importing…" : p.ready ? "Import" : "Soon"}
              </button>
            </div>
          ))}
        </div>
        <label className="field"><span>Or paste a CSV export</span>
          <textarea className="textarea" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"name,email,phone,source,stage,notes\nJamie Fox,jamie@example.com,,Instagram,New,Wants help with a knee"} style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }} />
        </label>
        <button className="btn block" disabled={!csv.trim() || !!busy} onClick={() => run("csv", "/pipeline/ingest", { provider: "csv", csv })}>
          {busy === "csv" ? "Importing…" : "Import CSV"}
        </button>
        {data.imports.length > 0 && (
          <div className="tiny faint">
            Recent: {data.imports.map((i) => `${providerLabel(i.provider, data.providers)} ${relTime(i.created_at)} (+${i.created_count})`).join(" · ")}
          </div>
        )}
      </div>
    </Sheet>
  );
}
