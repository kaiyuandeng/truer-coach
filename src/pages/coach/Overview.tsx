import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi, useOnFocus } from "../../hooks";
import { addDays, dayLabel, greeting, parseYmd, relTime } from "../../dates";
import { useSession } from "../../session";
import { Icon } from "../../components/Icon";
import { Empty, painColor } from "../../components/ui";
import type { CrmRow } from "./Clients";

type Day = { date: string; planned: number; done: number; pain_after: number | null };
type ClientExtra = { days: Day[]; waiting: number; latest: string | null; latest_at: string | null; next_on: string | null; last_on: string | null };
type OverviewData = { today: string; from: string; to: string; clients: Record<string, ClientExtra> };

type Status = "risk" | "nudge" | "track" | "new";
const STATUS: Record<Status, { label: string; className: string }> = {
  risk: { label: "Needs you", className: "status-risk" },
  nudge: { label: "Worth a nudge", className: "status-nudge" },
  track: { label: "On track", className: "status-track" },
  new: { label: "Getting started", className: "status-new" },
};

type Row = CrmRow & ClientExtra & { status: Status; pain_prev: number | null };

const EMPTY: ClientExtra = { days: [], waiting: 0, latest: null, latest_at: null, next_on: null, last_on: null };

function statusOf(r: CrmRow & { waiting: number }): Status {
  if (!r.last_active_at && r.invite_code) return "new";
  if (r.churn_risk === "high") return "risk";
  if (r.churn_risk === "medium") return "nudge";
  return "track";
}

const RANK: Record<Status, number> = { risk: 0, nudge: 1, new: 2, track: 3 };

/** At a glance: how every active client is doing, who needs a hand, and what's waiting on a reply. */
export function Overview() {
  const { me } = useSession();
  const nav = useNavigate();
  const crm = useApi<(CrmRow & { pain_prev: number | null })[]>("/crm");
  const ov = useApi<OverviewData>("/overview");
  const [filter, setFilter] = useState<Status | "waiting" | null>(null);
  useOnFocus(crm.reload);
  useOnFocus(ov.reload);

  const rows: Row[] = useMemo(() => {
    if (!crm.data) return [];
    return crm.data
      .filter((r) => r.stage === "active")
      .map((r) => {
        const extra = ov.data?.clients[r.id] ?? EMPTY;
        return { ...r, ...extra, status: statusOf({ ...r, waiting: extra.waiting }) };
      })
      .sort((a, b) => RANK[a.status] - RANK[b.status] || b.waiting - a.waiting || a.engagement - b.engagement);
  }, [crm.data, ov.data]);

  const today = ov.data?.today ?? new Date().toISOString().slice(0, 10);
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const waitingTotal = rows.reduce((n, r) => n + r.waiting, 0);
  const waitingClients = rows.filter((r) => r.waiting > 0).length;
  const followUps = (crm.data ?? []).filter((r) => r.stage !== "active" && r.stage !== "churned" && r.follow_up_on && r.follow_up_on <= today);
  const shown = rows.filter((r) => !filter || (filter === "waiting" ? r.waiting > 0 : r.status === filter));

  const loading = !crm.data;

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>{greeting()}, {me.name.split(" ")[0]}</h1>
          <p className="page-sub">{loading ? " " : summary(rows, waitingTotal)}</p>
        </div>
        <Link to="/clients" className="btn hide-narrow">All clients</Link>
      </header>

      <div className="status-tiles" role="group" aria-label="Filter clients">
        <StatusTile tone="risk" n={count("risk")} label="Need you" hint="High churn risk" on={filter === "risk"} onClick={() => setFilter(filter === "risk" ? null : "risk")} loading={loading} />
        <StatusTile tone="nudge" n={count("nudge")} label="Worth a nudge" hint="One warning sign" on={filter === "nudge"} onClick={() => setFilter(filter === "nudge" ? null : "nudge")} loading={loading} />
        <StatusTile tone="track" n={count("track")} label="On track" hint="Training as planned" on={filter === "track"} onClick={() => setFilter(filter === "track" ? null : "track")} loading={loading} />
        <StatusTile
          tone="brand"
          n={waitingTotal}
          label="Awaiting reply"
          hint={waitingClients ? `From ${waitingClients} client${waitingClients === 1 ? "" : "s"}` : "All caught up"}
          on={filter === "waiting"}
          onClick={() => setFilter(filter === "waiting" ? null : "waiting")}
          loading={loading}
        />
      </div>

      <div className="row between section-row">
        <div className="section-title" style={{ margin: 0 }}>
          {filter ? (filter === "waiting" ? "Awaiting your reply" : STATUS[filter].label) : "Active clients"} <span className="count">{shown.length}</span>
        </div>
        <div className="row tiny faint legend">
          <span><i className="d done" /> Done</span>
          <span><i className="d missed" /> Missed</span>
          <span><i className="d planned" /> Planned</span>
          {filter && <button className="btn sm ghost" onClick={() => setFilter(null)}>Show all</button>}
        </div>
      </div>

      {loading ? (
        <div className="client-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="client-card skeleton" />)}</div>
      ) : !rows.length ? (
        <div className="card pad"><Empty icon="users" title="No active clients yet">Add a client from the Clients page and send them their invite link.</Empty></div>
      ) : !shown.length ? (
        <div className="card pad"><Empty icon="check" title="Nobody here">{filter === "waiting" ? "Every comment has a reply. Nice." : "No clients in this group right now."}</Empty></div>
      ) : (
        <div className="client-grid">
          {shown.map((r, i) => (
            <ClientCard key={r.id} r={r} today={today} from={ov.data?.from ?? addDays(today, -13)} index={i} onOpen={() => nav(`/clients/${r.id}`)} />
          ))}
        </div>
      )}

      {followUps.length > 0 && (
        <>
          <div className="section-title">Pipeline follow-ups due</div>
          <div className="list">
            {followUps.map((r) => (
              <Link key={r.id} to={`/clients/${r.id}?tab=profile`} className="list-item">
                <div className="avatar">{r.name[0]}</div>
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>{r.name}</div>
                  <div className="tiny muted">{r.stage === "lead" ? "Lead" : r.stage === "consult" ? "Consult booked" : "Paused"}{r.source ? ` · ${r.source}` : ""}</div>
                </div>
                <span className="chip">Follow up {dayLabel(r.follow_up_on!).toLowerCase()}</span>
                <Icon name="chev" size={18} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function summary(rows: Row[], waiting: number) {
  if (!rows.length) return "No active clients yet.";
  const risk = rows.filter((r) => r.status === "risk");
  const track = rows.filter((r) => r.status === "track").length;
  const parts: string[] = [];
  if (risk.length) parts.push(`${names(risk.map((r) => r.name.split(" ")[0]))} need${risk.length === 1 ? "s" : ""} a check-in`);
  if (waiting) parts.push(`${waiting} comment${waiting === 1 ? "" : "s"} waiting on you`);
  if (!parts.length) return `All ${rows.length} clients are on track. Enjoy it.`;
  return parts.join(", and ") + `. ${track} of ${rows.length} on track.`;
}

function names(list: string[]) {
  return list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function StatusTile({ tone, n, label, hint, on, onClick, loading }: { tone: string; n: number; label: string; hint: string; on: boolean; onClick: () => void; loading: boolean }) {
  return (
    <button className={`status-tile tone-${tone}${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>
      <span className="v">{loading ? "–" : n}</span>
      <span className="l">{label}</span>
      <span className="h">{hint}</span>
    </button>
  );
}

function ClientCard({ r, today, from, index, onOpen }: { r: Row; today: string; from: string; index: number; onOpen: () => void }) {
  const byDate = new Map(r.days.map((d) => [d.date, d]));
  const strip = Array.from({ length: 21 }, (_, i) => addDays(from, i));
  const pain = r.pain_14d;
  const trend = pain !== null && r.pain_prev !== null ? pain - r.pain_prev : null;
  const nothingAhead = !r.next_on || (r.last_on ?? "") < addDays(today, 2);

  return (
    <article
      className={`client-card ${STATUS[r.status].className}`}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen()}
      tabIndex={0}
      aria-label={`${r.name}, ${STATUS[r.status].label}`}
    >
      <div className="cc-head">
        <Ring value={r.engagement} />
        <div className="grow">
          <div className="cc-name ellipsis">{r.name}</div>
          <div className="cc-dx ellipsis">{r.diagnosis || " "}</div>
        </div>
        <span className="status-pill">{STATUS[r.status].label}</span>
      </div>

      <div className="strip" aria-label="Last two weeks and the week ahead">
        {strip.map((d) => {
          const day = byDate.get(d);
          const state = !day ? "rest" : day.done ? "done" : d < today ? "missed" : "planned";
          return (
            <span
              key={d}
              className={`d ${state}${d === today ? " today" : ""}`}
              title={`${dayLabel(d)}: ${state === "rest" ? "rest day" : state}${day?.done && day.pain_after !== null ? ` · pain ${day.pain_after}/10` : ""}`}
            />
          );
        })}
      </div>
      <div className="strip-labels tiny faint">
        <span>{parseYmd(from).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>Today</span>
        <span>Next week</span>
      </div>

      <div className="cc-stats">
        <div>
          <span className="k">Done</span>
          <span className="v">{r.scheduled_14d ? <span>{r.completed_14d}<span className="faint">/{r.scheduled_14d}</span></span> : <span className="faint">–</span>}</span>
        </div>
        <div>
          <span className="k">Pain</span>
          <span className="v">
            {pain !== null ? (
              <>
                <span className="pain-dot" style={{ background: painColor(pain) }} />
                {pain.toFixed(1)}
                {trend !== null && Math.abs(trend) >= 0.5 && (
                  <span className={`trend ${trend > 0 ? "up" : "down"}`} title={`${trend > 0 ? "Up" : "Down"} ${Math.abs(trend).toFixed(1)} vs the two weeks before`}>
                    {trend > 0 ? "▲" : "▼"}
                  </span>
                )}
              </>
            ) : (
              <span className="faint">–</span>
            )}
          </span>
        </div>
        <div>
          <span className="k">Active</span>
          <span className="v small">{r.last_active_at ? relTime(r.last_active_at) : <span className="faint">{r.invite_code ? "Invite sent" : "Never"}</span>}</span>
        </div>
      </div>

      {r.risk_reasons.length > 0 && (
        <div className="cc-reasons">
          {r.risk_reasons.map((x) => <span key={x} className="reason">{x}</span>)}
        </div>
      )}

      {r.waiting > 0 && r.latest && (
        <Link to="/inbox" className="cc-quote" onClick={(e) => e.stopPropagation()}>
          <Icon name="messages" size={14} />
          <span className="grow ellipsis">“{r.latest}”</span>
          {r.waiting > 1 && <span className="chip brand tiny">+{r.waiting - 1}</span>}
          <span className="tiny faint">{r.latest_at ? relTime(r.latest_at) : ""}</span>
        </Link>
      )}

      <div className="cc-foot">
        {nothingAhead ? (
          <span className="cc-warn"><Icon name="calendar" size={14} /> {r.next_on ? `Program ends ${dayLabel(r.last_on!).toLowerCase()}` : "Nothing planned"}</span>
        ) : (
          <span className="faint"><Icon name="calendar" size={14} /> Next {dayLabel(r.next_on!).toLowerCase()}</span>
        )}
        <span className="cc-open">{nothingAhead ? "Plan week" : "Open"} <Icon name="chev" size={14} /></span>
      </div>
    </article>
  );
}

function Ring({ value }: { value: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const color = value >= 70 ? "var(--accent)" : value >= 45 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="cc-ring" title={`Engagement ${value}/100`}>
      <svg viewBox="0 0 40 40" width="40" height="40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      <span>{value}</span>
    </div>
  );
}
