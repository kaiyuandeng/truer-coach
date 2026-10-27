/**
 * Onboarding pipeline routes: the lead board, moving leads through Evan's calls, and CRM ingest.
 * The rules themselves live in pipeline-logic.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "./util";
import { addDays, fail, id, inviteCode, str } from "./util";
import { patientFor, requireTherapist } from "./auth";
import { ADAPTERS, adapter } from "./crm";
import { STEPS, funnel, mergeStep, normalizeLead, parseCsv, stageForStep, stampsForMove, stepForStage, type CrmLead, type Step, type Stamps } from "./pipeline-logic";

export const pipeline = new Hono<AppEnv>();

const today = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** "YYYY-MM-DDTHH:MM" from a datetime-local input, or null to clear. */
function callTime(v: unknown): string | null {
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) fail(400, "Pick a date and time for the call");
  return v;
}

pipeline.get("/", async (c) => {
  const user = requireTherapist(c);
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, COALESCE(p.email, lp.contact_email) AS email, p.phone, p.diagnosis, p.notes, p.source, p.monthly_rate,
       p.follow_up_on, p.invite_code, p.stage,
       COALESCE(lp.created_at, p.created_at) AS created_at, COALESCE(lp.step_changed_at, p.stage_changed_at) AS step_changed_at,
       lp.step, lp.pitch_at, lp.pitch_done_at, lp.needs_at, lp.needs_done_at, lp.decided_at, lp.lost_reason, lp.crm_provider
     FROM users p LEFT JOIN lead_pipeline lp ON lp.patient_id = p.id
     WHERE p.therapist_id = ? AND p.role = 'patient' AND p.archived = 0
       AND (lp.patient_id IS NOT NULL OR p.stage IN ('lead', 'consult'))
     ORDER BY COALESCE(lp.step_changed_at, p.stage_changed_at) DESC`,
  )
    .bind(user.id)
    .all<Record<string, string | number | null> & { step: Step | null; stage: string; created_at: string }>();
  const leads = results.map((r) => ({ ...r, step: r.step ?? stepForStage(r.stage) ?? "new" }));
  const { results: imports } = await c.env.DB.prepare(
    "SELECT id, provider, created_count, updated_count, skipped_count, created_at FROM crm_imports WHERE therapist_id = ? ORDER BY created_at DESC LIMIT 5",
  )
    .bind(user.id)
    .all();
  return c.json({
    leads,
    funnel: funnel(leads as never, addDays(today(), -90)),
    imports,
    providers: ADAPTERS.map((a) => ({ id: a.id, label: a.label, blurb: a.blurb, ready: a.ready(c.env) })),
  });
});

/** Moves a lead to a step and/or books their calls. Returns the invite code when they sign up. */
pipeline.patch("/:id", async (c) => {
  const user = requireTherapist(c);
  const patient = await patientFor(c, c.req.param("id"));
  const b = await body(c);
  const db = c.env.DB;
  const cur = await ensureRow(db, user.id, patient.id);
  const stmts: D1PreparedStatement[] = [];
  if ("step" in b) {
    const to = String(b.step) as Step;
    if (!STEPS.includes(to)) fail(400, "Unknown step");
    if (to !== cur.step) {
      const s = stampsForMove(cur, to, nowStamp());
      stmts.push(
        db.prepare(
          `UPDATE lead_pipeline SET step = ?, step_changed_at = datetime('now'), pitch_done_at = ?, needs_done_at = ?, decided_at = ?,
             lost_reason = CASE WHEN ? = 'lost' THEN lost_reason ELSE NULL END WHERE patient_id = ?`,
        ).bind(to, s.pitch_done_at, s.needs_done_at, s.decided_at, to, patient.id),
        db.prepare("UPDATE users SET stage = ?, stage_changed_at = datetime('now') WHERE id = ? AND stage != ?").bind(stageForStep(to), patient.id, stageForStep(to)),
      );
    }
  }
  if ("pitch_at" in b) stmts.push(db.prepare("UPDATE lead_pipeline SET pitch_at = ? WHERE patient_id = ?").bind(callTime(b.pitch_at), patient.id));
  if ("needs_at" in b) stmts.push(db.prepare("UPDATE lead_pipeline SET needs_at = ? WHERE patient_id = ?").bind(callTime(b.needs_at), patient.id));
  if ("lost_reason" in b) stmts.push(db.prepare("UPDATE lead_pipeline SET lost_reason = ? WHERE patient_id = ?").bind(str(b.lost_reason, 300), patient.id));
  // A new client who hasn't set up their account yet gets an invite link to share.
  const justWon = b.step === "won" && cur.step !== "won";
  if (justWon)
    stmts.push(db.prepare("UPDATE users SET invite_code = ? WHERE id = ? AND password_hash IS NULL AND invite_code IS NULL").bind(inviteCode(), patient.id));
  if (stmts.length) await db.batch(stmts);
  const row = justWon
    ? await db.prepare("SELECT invite_code FROM users WHERE id = ? AND password_hash IS NULL").bind(patient.id).first<{ invite_code: string | null }>()
    : null;
  return c.json({ ok: true, invite_code: row?.invite_code ?? null });
});

/** Pulls leads from a connected CRM adapter. */
pipeline.post("/import", async (c) => {
  const user = requireTherapist(c);
  const b = await body(c);
  const a = adapter(String(b.provider ?? ""));
  if (!a) fail(400, "Unknown CRM");
  if (!a.ready(c.env)) fail(400, `${a.label} isn't connected yet`);
  const raw = await a.fetchLeads(c.env, user.id, today());
  return c.json(await ingest(c.env.DB, user.id, a.id, raw));
});

/**
 * Generic ingest for CRMs without an adapter: a webhook, Zapier, or a pasted CSV posts
 * { provider, leads: [...] } or { provider, csv } with fields like name/first_name, email, phone, source, stage, notes.
 */
pipeline.post("/ingest", async (c) => {
  const user = requireTherapist(c);
  const b = await body(c);
  const provider = (str(b.provider, 40) ?? "import").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "import";
  const leads: unknown = typeof b.csv === "string" ? parseCsv(b.csv.slice(0, 500_000)) : b.leads;
  if (!Array.isArray(leads) || !leads.length) fail(400, typeof b.csv === "string" ? "That CSV has no rows under its header" : "Expected a list of leads");
  if (leads.length > 500) fail(400, "Import up to 500 leads at a time");
  return c.json(await ingest(c.env.DB, user.id, provider, leads.filter((l): l is Record<string, unknown> => !!l && typeof l === "object")));
});

type Existing = Stamps & { patient_id: string; step: Step | null; stage: string; email: string | null; crm_provider: string | null; crm_external_id: string | null; pitch_at: string | null; needs_at: string | null };

async function ingest(db: D1Database, therapistId: string, provider: string, raw: Record<string, unknown>[]) {
  const leads = raw.map(normalizeLead);
  const usable = leads.filter((l): l is CrmLead => !!l);
  const { results: existing } = await db.prepare(
    `SELECT p.id AS patient_id, p.stage, COALESCE(p.email, lp.contact_email) AS email, lp.step, lp.crm_provider, lp.crm_external_id,
       lp.pitch_at, lp.needs_at, lp.pitch_done_at, lp.needs_done_at, lp.decided_at
     FROM users p LEFT JOIN lead_pipeline lp ON lp.patient_id = p.id WHERE p.therapist_id = ? AND p.role = 'patient'`,
  )
    .bind(therapistId)
    .all<Existing>();
  const byCrm = new Map(existing.filter((e) => e.crm_external_id).map((e) => [`${e.crm_provider}:${e.crm_external_id}`, e]));
  const byEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]));

  const now = nowStamp();
  const stmts: D1PreparedStatement[] = [];
  let created = 0;
  let updated = 0;
  let skipped = leads.length - usable.length;
  const seen = new Set<string>();
  for (const l of usable) {
    if (seen.has(l.external_id)) {
      skipped++;
      continue;
    }
    seen.add(l.external_id);
    const match = byCrm.get(`${provider}:${l.external_id}`) ?? (l.email ? byEmail.get(l.email) : undefined);
    if (!match) {
      const pid = id();
      const s = stampsForMove({ pitch_done_at: null, needs_done_at: null, decided_at: null }, l.step, now);
      stmts.push(
        db.prepare(
          `INSERT INTO users (id, role, name, therapist_id, invite_code, diagnosis, notes, stage, source, phone, monthly_rate, created_at)
           VALUES (?, 'patient', ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
        ).bind(pid, l.name, therapistId, inviteCode(), l.interest, l.notes, stageForStep(l.step), l.source, l.phone, l.monthly_rate, l.created_at),
        db.prepare(
          `INSERT INTO lead_pipeline (patient_id, therapist_id, step, pitch_at, needs_at, pitch_done_at, needs_done_at, decided_at,
             contact_email, crm_provider, crm_external_id, imported_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), COALESCE(?, datetime('now')))`,
        ).bind(pid, therapistId, l.step, l.pitch_at, l.needs_at, s.pitch_done_at, s.needs_done_at, s.decided_at, l.email, provider, l.external_id, l.created_at),
      );
      created++;
      continue;
    }
    // Someone already training who wasn't tracked in the pipeline: leave them alone.
    if (!match.step && !stepForStage(match.stage)) {
      skipped++;
      continue;
    }
    const cur: Step = match.step ?? stepForStage(match.stage)!;
    const next = mergeStep(cur, l.step);
    const s = next === cur ? match : stampsForMove(match, next, now);
    const pitchAt = match.pitch_at ?? l.pitch_at;
    const needsAt = match.needs_at ?? l.needs_at;
    const changed = next !== cur || pitchAt !== match.pitch_at || needsAt !== match.needs_at || !match.crm_external_id;
    stmts.push(
      db.prepare(
        `INSERT INTO lead_pipeline (patient_id, therapist_id, step) VALUES (?, ?, ?) ON CONFLICT (patient_id) DO NOTHING`,
      ).bind(match.patient_id, therapistId, cur),
      db.prepare(
        `UPDATE lead_pipeline SET step = ?, step_changed_at = CASE WHEN step != ? THEN datetime('now') ELSE step_changed_at END,
           pitch_at = ?, needs_at = ?, pitch_done_at = ?, needs_done_at = ?, decided_at = ?,
           contact_email = COALESCE(contact_email, ?), crm_provider = COALESCE(crm_provider, ?), crm_external_id = COALESCE(crm_external_id, ?),
           imported_at = datetime('now')
         WHERE patient_id = ?`,
      ).bind(next, next, pitchAt, needsAt, s.pitch_done_at, s.needs_done_at, s.decided_at, l.email, provider, l.external_id, match.patient_id),
      db.prepare(
        `UPDATE users SET stage_changed_at = CASE WHEN COALESCE(?, stage) != stage THEN datetime('now') ELSE stage_changed_at END,
           stage = COALESCE(?, stage), phone = COALESCE(phone, ?), source = COALESCE(source, ?), diagnosis = COALESCE(diagnosis, ?), monthly_rate = COALESCE(monthly_rate, ?)
         WHERE id = ?`,
      ).bind(next === cur ? null : stageForStep(next), next === cur ? null : stageForStep(next), l.phone, l.source, l.interest, l.monthly_rate, match.patient_id),
    );
    if (changed) updated++;
    else skipped++;
  }
  const importId = id();
  stmts.push(
    db.prepare("INSERT INTO crm_imports (id, therapist_id, provider, created_count, updated_count, skipped_count) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(importId, therapistId, provider, created, updated, skipped),
  );
  await db.batch(stmts);
  return { id: importId, provider, created, updated, skipped };
}

/** Creates the pipeline row for someone added before the pipeline existed. */
async function ensureRow(db: D1Database, therapistId: string, patientId: string): Promise<Stamps & { step: Step }> {
  const row = await db.prepare("SELECT step, pitch_done_at, needs_done_at, decided_at FROM lead_pipeline WHERE patient_id = ?")
    .bind(patientId)
    .first<Stamps & { step: Step }>();
  if (row) return row;
  const u = await db.prepare("SELECT stage, created_at FROM users WHERE id = ?").bind(patientId).first<{ stage: string; created_at: string }>();
  const step = stepForStage(u?.stage ?? "") ?? (u?.stage === "active" ? "won" : "new");
  await db.prepare("INSERT INTO lead_pipeline (patient_id, therapist_id, step, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (patient_id) DO NOTHING")
    .bind(patientId, therapistId, step, u?.created_at ?? nowStamp())
    .run();
  return { step, pitch_done_at: null, needs_done_at: null, decided_at: null };
}

/**
 * Keeps the pipeline step in line when the coach changes someone's lifecycle stage elsewhere
 * (e.g. the profile tab). Only touches people who are already in the pipeline.
 */
export async function syncStepFromStage(db: D1Database, patientId: string, stage: string) {
  const row = await db.prepare("SELECT step, pitch_done_at, needs_done_at, decided_at FROM lead_pipeline WHERE patient_id = ?")
    .bind(patientId)
    .first<Stamps & { step: Step }>();
  if (!row) return;
  const to: Step | null =
    stage === "active" ? "won"
    : stage === "churned" ? (row.step === "won" ? null : "lost")
    : stage === "paused" ? null
    : stage === "consult" ? (stageForStep(row.step) === "consult" ? null : "needs")
    : stageForStep(row.step) === "lead" ? null : "new";
  if (!to || to === row.step) return;
  const s = stampsForMove(row, to, nowStamp());
  await db.prepare(
    `UPDATE lead_pipeline SET step = ?, step_changed_at = datetime('now'), pitch_done_at = ?, needs_done_at = ?, decided_at = ?,
       lost_reason = CASE WHEN ? = 'lost' THEN lost_reason ELSE NULL END WHERE patient_id = ?`,
  )
    .bind(to, s.pitch_done_at, s.needs_done_at, s.decided_at, to, patientId)
    .run();
}
