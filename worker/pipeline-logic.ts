/**
 * Pure onboarding-pipeline rules shared by the worker routes and the tests (no runtime imports).
 * Evan's process: a lead books a 15 minute pitch call, then a 1 hour needs call, then decides.
 */

export const STEPS = ["new", "pitch", "needs", "decision", "won", "lost"] as const;
export type Step = (typeof STEPS)[number];

/** The client-lifecycle stage on users.stage that each pipeline step implies. */
export function stageForStep(step: Step): "lead" | "consult" | "active" | "churned" {
  return step === "new" || step === "pitch" ? "lead" : step === "needs" || step === "decision" ? "consult" : step === "won" ? "active" : "churned";
}

/** Where a person with no pipeline row sits, from their lifecycle stage. */
export function stepForStage(stage: string): Step | null {
  return stage === "lead" ? "new" : stage === "consult" ? "needs" : null;
}

const order = (s: Step) => (s === "lost" ? -1 : STEPS.indexOf(s));

export type Stamps = { pitch_done_at: string | null; needs_done_at: string | null; decided_at: string | null };

/**
 * Timestamps after moving to `to`. Moving forward records the calls as done; moving back clears
 * what hasn't happened yet. Lost keeps how far they got so the funnel can show where leads drop.
 */
export function stampsForMove(cur: Stamps, to: Step, now: string): Stamps {
  if (to === "lost") return { ...cur, decided_at: now };
  const i = order(to);
  return {
    pitch_done_at: i >= order("needs") ? cur.pitch_done_at ?? now : null,
    needs_done_at: i >= order("decision") ? cur.needs_done_at ?? now : null,
    decided_at: to === "won" ? cur.decided_at ?? now : null,
  };
}

/** A CRM re-import may move a lead forward, never back, and never reopens a decided lead. */
export function mergeStep(cur: Step, incoming: Step): Step {
  if (cur === "won" || cur === "lost") return cur;
  if (incoming === "lost" || incoming === "won") return incoming;
  return order(incoming) > order(cur) ? incoming : cur;
}

// ---------- Ingest: the normalized shape every CRM adapter produces ----------

export type CrmLead = {
  external_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  interest: string | null;
  notes: string | null;
  step: Step;
  pitch_at: string | null;
  needs_at: string | null;
  monthly_rate: number | null;
  created_at: string | null;
};

const text = (v: unknown, max = 500) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) || null : null);
const isDateTime = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(v) && !Number.isNaN(Date.parse(v));

/** Common CRM stage names mapped onto Evan's steps. */
const STAGE_WORDS: [RegExp, Step][] = [
  [/won|closed.?won|customer|client|signed|paid/i, "won"],
  [/lost|closed.?lost|unqualified|dead|no.?show/i, "lost"],
  [/decision|deciding|proposal|negotiat|contract/i, "decision"],
  [/needs|discovery|consult|assessment|demo/i, "needs"],
  [/pitch|intro|call.?booked|appointment|scheduled|qualified/i, "pitch"],
];

export function stepFromCrm(v: unknown): Step {
  const s = text(v, 80);
  if (!s) return "new";
  if ((STEPS as readonly string[]).includes(s.toLowerCase())) return s.toLowerCase() as Step;
  return STAGE_WORDS.find(([re]) => re.test(s))?.[1] ?? "new";
}

/** Validates one raw record into a CrmLead, or returns null when it can't be used (no name or id). */
export function normalizeLead(raw: Record<string, unknown>): CrmLead | null {
  const first = text(raw.first_name ?? raw.firstname, 60);
  const last = text(raw.last_name ?? raw.lastname, 60);
  const name = text(raw.name, 100) ?? ([first, last].filter(Boolean).join(" ") || null);
  const email = text(raw.email, 200)?.toLowerCase() ?? null;
  const external_id = text(raw.external_id ?? raw.id, 120) ?? email;
  if (!name || !external_id) return null;
  const at = (v: unknown) => {
    const s = text(v, 30);
    return isDateTime(s) ? s!.slice(0, 16) : null;
  };
  const rate = Number(raw.monthly_rate ?? raw.amount ?? NaN);
  return {
    external_id,
    name,
    email: email && email.includes("@") ? email : null,
    phone: text(raw.phone, 40),
    source: text(raw.source ?? raw.lead_source, 100),
    interest: text(raw.interest ?? raw.goal ?? raw.diagnosis, 300),
    notes: text(raw.notes, 2000),
    step: stepFromCrm(raw.step ?? raw.stage ?? raw.status),
    pitch_at: at(raw.pitch_at),
    needs_at: at(raw.needs_at),
    monthly_rate: Number.isFinite(rate) && rate > 0 ? Math.round(rate) : null,
    created_at: at(raw.created_at)?.slice(0, 10) ?? null,
  };
}

/** Minimal CSV parser (quoted fields, commas, newlines) returning one object per row keyed by header. */
export function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') field += '"', i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

// ---------- Funnel ----------

export type FunnelRow = { step: Step; pitch_done_at: string | null; needs_done_at: string | null; created_at: string; decided_at: string | null };

/**
 * Conversion through each call for leads created since `since`: how many had the pitch call,
 * the needs call, and signed up, plus win rate among decided leads and days from lead to client.
 */
export function funnel(rows: FunnelRow[], since: string) {
  const cohort = rows.filter((r) => r.created_at.slice(0, 10) >= since);
  const pitched = cohort.filter((r) => r.pitch_done_at || r.step === "won");
  const needs = cohort.filter((r) => r.needs_done_at || r.step === "won");
  const won = cohort.filter((r) => r.step === "won");
  const lost = cohort.filter((r) => r.step === "lost");
  const days = won
    .filter((r) => r.decided_at)
    .map((r) => Math.max(0, (Date.parse(r.decided_at!.slice(0, 10)) - Date.parse(r.created_at.slice(0, 10))) / 86400_000));
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  return {
    since,
    leads: cohort.length,
    pitched: pitched.length,
    needs: needs.length,
    won: won.length,
    lost: lost.length,
    pitch_rate: pct(pitched.length, cohort.length),
    needs_rate: pct(needs.length, pitched.length),
    close_rate: pct(won.length, needs.length),
    win_rate: pct(won.length, won.length + lost.length),
    days_to_sign: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
  };
}
