import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./util";
import { headMedia, maxUpload, putMedia, readMedia } from "./media";
import { overview } from "./overview";
import { assignStatements, parseWeekdays, scheduleProgram, templateItems } from "./programs";
import { publicStoreRoutes, storeRoutes } from "./store";
import { DEMO_COACH_ID, DEMO_PATIENT_ID, demoSql, demoWipeSql } from "./demo";
import { addDays, fail, id, inviteCode, isDate, painScore, str } from "./util";
import {
  canReadMedia,
  endSession,
  hashPassword,
  patientFor,
  requireTherapist,
  requireUser,
  startSession,
  verifyPassword,
} from "./auth";

const app = new Hono<AppEnv>().basePath("/api");

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

const today = () => new Date().toISOString().slice(0, 10);

async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ---------- Auth (public) ----------

app.post("/auth/signup", async (c) => {
  const b = await body(c);
  const name = str(b.name, 100);
  const email = str(b.email, 200)?.toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  if (!name || !email || !email.includes("@")) fail(400, "Name and a valid email are required");
  if (password.length < 8) fail(400, "Password must be at least 8 characters");
  if (c.env.SIGNUP_CODE && b.signupCode !== c.env.SIGNUP_CODE) fail(403, "That sign-up code is not right");
  const existing = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (existing) fail(409, "An account with that email already exists");
  const { hash, salt } = await hashPassword(password);
  const userId = id();
  await c.env.DB.prepare(
    "INSERT INTO users (id, role, name, email, password_hash, password_salt) VALUES (?, 'therapist', ?, ?, ?, ?)",
  )
    .bind(userId, name, email, hash, salt)
    .run();
  await startSession(c, userId);
  return c.json({ ok: true });
});

app.post("/auth/login", async (c) => {
  const b = await body(c);
  const email = str(b.email, 200)?.toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const user = await c.env.DB.prepare(
    "SELECT id, password_hash, password_salt FROM users WHERE email = ? AND archived = 0",
  )
    .bind(email ?? "")
    .first<{ id: string; password_hash: string; password_salt: string }>();
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash, user.password_salt)))
    fail(401, "Email or password is incorrect");
  await startSession(c, user.id);
  return c.json({ ok: true });
});

app.get("/config", (c) => c.json({ demo: c.env.DEMO_MODE === "true" }));

app.post("/auth/logout", async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

app.get("/invite/:code", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT p.name, t.name AS therapist_name FROM users p JOIN users t ON t.id = p.therapist_id
     WHERE p.invite_code = ? AND p.archived = 0`,
  )
    .bind(c.req.param("code").toUpperCase())
    .first();
  if (!row) fail(404, "This invite link is no longer valid");
  return c.json(row);
});

app.post("/invite/:code", async (c) => {
  const b = await body(c);
  const email = str(b.email, 200)?.toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !email.includes("@")) fail(400, "A valid email is required");
  if (password.length < 8) fail(400, "Password must be at least 8 characters");
  const patient = await c.env.DB.prepare("SELECT id FROM users WHERE invite_code = ? AND archived = 0")
    .bind(c.req.param("code").toUpperCase())
    .first<{ id: string }>();
  if (!patient) fail(404, "This invite link is no longer valid");
  const taken = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ? AND id != ?").bind(email, patient.id).first();
  if (taken) fail(409, "An account with that email already exists");
  const { hash, salt } = await hashPassword(password);
  await c.env.DB.prepare(
    "UPDATE users SET email = ?, password_hash = ?, password_salt = ?, invite_code = NULL WHERE id = ?",
  )
    .bind(email, hash, salt, patient.id)
    .run();
  await startSession(c, patient.id);
  return c.json({ ok: true });
});

// ---------- Everything below needs a signed-in user ----------

// Course store pages are public so a coach can share their store link.
publicStoreRoutes(app);

app.use("/*", requireUser);

storeRoutes(app);

app.get("/me", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.role, u.name, u.email,
            t.id AS therapist_id, t.name AS therapist_name,
            (SELECT COUNT(*) FROM workouts w WHERE w.patient_id = u.id AND w.completed_at IS NOT NULL) AS completed_count
     FROM users u LEFT JOIN users t ON t.id = u.therapist_id WHERE u.id = ?`,
  )
    .bind(user.id)
    .first();
  return c.json(row);
});

app.patch("/me", async (c) => {
  const user = c.get("user");
  const b = await body(c);
  const name = str(b.name, 100);
  if (name) await c.env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, user.id).run();
  if (typeof b.newPassword === "string") {
    if (b.newPassword.length < 8) fail(400, "Password must be at least 8 characters");
    const row = await c.env.DB.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ password_hash: string; password_salt: string }>();
    if (!row || !(await verifyPassword(String(b.currentPassword ?? ""), row.password_hash, row.password_salt)))
      fail(403, "Current password is incorrect");
    const { hash, salt } = await hashPassword(b.newPassword);
    await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
      .bind(hash, salt, user.id)
      .run();
  }
  return c.json({ ok: true });
});

// ---------- Patients (therapist) ----------

app.get("/patients", async (c) => {
  const user = requireTherapist(c);
  const since = addDays(today(), -14);
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.email, p.diagnosis, p.invite_code, p.archived, p.created_at,
       (SELECT MAX(completed_at) FROM workouts w WHERE w.patient_id = p.id) AS last_completed_at,
       (SELECT COUNT(*) FROM workouts w WHERE w.patient_id = p.id AND w.scheduled_on >= ? AND w.scheduled_on <= ?) AS scheduled_14d,
       (SELECT COUNT(*) FROM workouts w WHERE w.patient_id = p.id AND w.scheduled_on >= ? AND w.scheduled_on <= ? AND w.completed_at IS NOT NULL) AS completed_14d,
       (SELECT MIN(scheduled_on) FROM workouts w WHERE w.patient_id = p.id AND w.scheduled_on >= ? AND w.completed_at IS NULL) AS next_scheduled_on,
       (SELECT MAX(scheduled_on) FROM workouts w WHERE w.patient_id = p.id) AS last_scheduled_on,
       (SELECT COUNT(*) FROM messages m WHERE m.patient_id = p.id AND m.sender_id = p.id AND m.read_at IS NULL) AS unread_messages,
       (SELECT COUNT(*) FROM workouts w WHERE w.patient_id = p.id AND w.completed_at IS NOT NULL AND w.completed_at > COALESCE(
          (SELECT MAX(created_at) FROM workout_comments wc WHERE wc.workout_id = w.id AND wc.author_id = ?), '0')
          AND w.scheduled_on >= ?) AS unreviewed,
       (SELECT AVG(COALESCE(pain_after, pain_before)) FROM workouts w WHERE w.patient_id = p.id AND w.completed_at IS NOT NULL AND w.scheduled_on >= ?) AS avg_pain_14d,
       (SELECT AVG(COALESCE(pain_after, pain_before)) FROM workouts w WHERE w.patient_id = p.id AND w.completed_at IS NOT NULL AND w.scheduled_on >= ? AND w.scheduled_on < ?) AS avg_pain_prev_14d
     FROM users p WHERE p.therapist_id = ? AND p.role = 'patient'
     ORDER BY p.archived, p.name COLLATE NOCASE`,
  )
    .bind(
      since, today(), since, today(), today(), user.id, since, since,
      addDays(today(), -28), since, user.id,
    )
    .all();
  return c.json(results);
});

app.post("/patients", async (c) => {
  const user = requireTherapist(c);
  const b = await body(c);
  const name = str(b.name, 100);
  if (!name) fail(400, "Name is required");
  const patientId = id();
  const code = inviteCode();
  const stage = STAGES.includes(String(b.stage)) ? String(b.stage) : "active";
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, role, name, therapist_id, invite_code, diagnosis, goals, notes, stage, source, phone, monthly_rate, follow_up_on)
       VALUES (?, 'patient', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      patientId, name, user.id, code, str(b.diagnosis), str(b.goals), str(b.notes), stage, str(b.source, 100), str(b.phone, 40),
      b.monthly_rate === undefined || b.monthly_rate === "" || b.monthly_rate === null ? null : Math.round(Number(b.monthly_rate)) || null,
      isDate(b.follow_up_on) ? b.follow_up_on : null,
    ),
  ]);
  return c.json({ id: patientId, invite_code: code });
});

app.get("/patients/:id", async (c) => {
  const patient = await patientFor(c, c.req.param("id"));
  const row = await c.env.DB.prepare(
    `SELECT id, name, email, diagnosis, goals, notes, invite_code, archived, created_at,
            stage, stage_changed_at, source, phone, monthly_rate, follow_up_on FROM users WHERE id = ?`,
  )
    .bind(patient.id)
    .first();
  return c.json(row);
});

app.patch("/patients/:id", async (c) => {
  const user = c.get("user");
  const patient = await patientFor(c, c.req.param("id"));
  const b = await body(c);
  requireTherapist(c);
  const fields = ["name", "diagnosis", "goals", "notes"];
  for (const f of fields) {
    if (f in b) {
      const v = str(b[f]);
      if (f === "name" && !v) fail(400, "Name is required");
      await c.env.DB.prepare(`UPDATE users SET ${f} = ? WHERE id = ?`).bind(v, patient.id).run();
    }
  }
  if (user.role === "therapist") {
    if ("stage" in b) {
      if (!STAGES.includes(String(b.stage))) fail(400, "Unknown stage");
      await c.env.DB.prepare("UPDATE users SET stage = ?, stage_changed_at = datetime('now') WHERE id = ? AND stage != ?")
        .bind(b.stage, patient.id, b.stage)
        .run();
    }
    for (const f of ["source", "phone"]) if (f in b) await c.env.DB.prepare(`UPDATE users SET ${f} = ? WHERE id = ?`).bind(str(b[f], 100), patient.id).run();
    if ("monthly_rate" in b)
      await c.env.DB.prepare("UPDATE users SET monthly_rate = ? WHERE id = ?")
        .bind(b.monthly_rate === null || b.monthly_rate === "" ? null : Math.round(Number(b.monthly_rate)) || null, patient.id)
        .run();
    if ("follow_up_on" in b)
      await c.env.DB.prepare("UPDATE users SET follow_up_on = ? WHERE id = ?").bind(isDate(b.follow_up_on) ? b.follow_up_on : null, patient.id).run();
  }
  if (user.role === "therapist" && "archived" in b)
    await c.env.DB.prepare("UPDATE users SET archived = ? WHERE id = ?").bind(b.archived ? 1 : 0, patient.id).run();
  return c.json({ ok: true });
});

app.post("/patients/:id/invite", async (c) => {
  requireTherapist(c);
  const patient = await patientFor(c, c.req.param("id"));
  const code = inviteCode();
  await c.env.DB.prepare("UPDATE users SET invite_code = ? WHERE id = ?").bind(code, patient.id).run();
  return c.json({ invite_code: code });
});

// ---------- Exercise library ----------

export const STAGES = ["lead", "consult", "active", "paused", "churned"];

const EXERCISE_COLUMNS = "id, therapist_id, name, body_area, category, description, video_key, video_url, default_instructions";

app.get("/exercises", async (c) => {
  const user = c.get("user");
  const therapistId = user.role === "therapist" ? user.id : user.therapist_id;
  const { results } = await c.env.DB.prepare(
    `SELECT ${EXERCISE_COLUMNS},
       (SELECT COUNT(*) FROM workout_items wi JOIN workouts w ON w.id = wi.workout_id WHERE wi.exercise_id = e.id AND w.therapist_id = ?) AS times_used
     FROM exercises e WHERE therapist_id IS NULL OR therapist_id = ?
     ORDER BY therapist_id IS NULL, name COLLATE NOCASE`,
  )
    .bind(therapistId, therapistId)
    .all();
  return c.json(results);
});

function exerciseFields(b: Record<string, unknown>) {
  const name = str(b.name, 120);
  if (!name) fail(400, "Exercise name is required");
  const videoUrl = str(b.video_url, 500);
  if (videoUrl && !/^https?:\/\//.test(videoUrl)) fail(400, "Video link must start with http");
  return [name, str(b.body_area, 60), str(b.category, 60), str(b.description), str(b.video_key, 300), videoUrl, str(b.default_instructions, 500)];
}

app.post("/exercises", async (c) => {
  const user = requireTherapist(c);
  const exerciseId = id();
  await c.env.DB.prepare(
    "INSERT INTO exercises (id, therapist_id, name, body_area, category, description, video_key, video_url, default_instructions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(exerciseId, user.id, ...exerciseFields(await body(c)))
    .run();
  return c.json(await c.env.DB.prepare(`SELECT ${EXERCISE_COLUMNS} FROM exercises WHERE id = ?`).bind(exerciseId).first());
});

app.patch("/exercises/:id", async (c) => {
  const user = requireTherapist(c);
  const existing = await c.env.DB.prepare("SELECT therapist_id FROM exercises WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ therapist_id: string | null }>();
  if (!existing || (existing.therapist_id && existing.therapist_id !== user.id)) fail(404, "Exercise not found");
  const fields = exerciseFields(await body(c));
  if (existing.therapist_id === null) {
    // Editing a built-in exercise makes a personal copy, so other therapists are unaffected.
    const copyId = id();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO exercises (id, therapist_id, name, body_area, category, description, video_key, video_url, default_instructions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(copyId, user.id, ...fields),
      c.env.DB.prepare(
        "UPDATE workout_items SET exercise_id = ? WHERE exercise_id = ? AND workout_id IN (SELECT id FROM workouts WHERE therapist_id = ?)",
      ).bind(copyId, c.req.param("id"), user.id),
    ]);
    return c.json(await c.env.DB.prepare(`SELECT ${EXERCISE_COLUMNS} FROM exercises WHERE id = ?`).bind(copyId).first());
  }
  await c.env.DB.prepare(
    "UPDATE exercises SET name = ?, body_area = ?, category = ?, description = ?, video_key = ?, video_url = ?, default_instructions = ? WHERE id = ?",
  )
    .bind(...fields, c.req.param("id"))
    .run();
  return c.json(await c.env.DB.prepare(`SELECT ${EXERCISE_COLUMNS} FROM exercises WHERE id = ?`).bind(c.req.param("id")).first());
});

app.delete("/exercises/:id", async (c) => {
  const user = requireTherapist(c);
  const used = await c.env.DB.prepare("SELECT 1 FROM workout_items WHERE exercise_id = ? LIMIT 1").bind(c.req.param("id")).first();
  if (used) fail(409, "This exercise is used in a workout, so it can't be deleted");
  await c.env.DB.prepare("DELETE FROM exercises WHERE id = ? AND therapist_id = ?").bind(c.req.param("id"), user.id).run();
  return c.json({ ok: true });
});

app.get("/exercises/:id/history", async (c) => {
  const patient = await patientFor(c, c.req.query("patientId"));
  const { results } = await c.env.DB.prepare(
    `SELECT wi.id, wi.result, wi.pain, wi.done, wi.instructions, wi.result_media_key, wi.result_media_type,
            w.id AS workout_id, w.scheduled_on, w.title
     FROM workout_items wi JOIN workouts w ON w.id = wi.workout_id
     WHERE w.patient_id = ? AND wi.exercise_id = ? AND (wi.done = 1 OR wi.result IS NOT NULL)
     ORDER BY w.scheduled_on DESC LIMIT 50`,
  )
    .bind(patient.id, c.req.param("id"))
    .all();
  return c.json(results);
});

// ---------- Workouts ----------

app.get("/workouts", async (c) => {
  const patient = await patientFor(c, c.req.query("patientId"));
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!isDate(from) || !isDate(to)) fail(400, "from and to dates are required");
  const { results: workouts } = await c.env.DB.prepare(
    `SELECT w.id, w.scheduled_on, w.title, w.notes, w.completed_at, w.pain_before, w.pain_after,
       (SELECT COUNT(*) FROM workout_comments wc WHERE wc.workout_id = w.id) AS comment_count
     FROM workouts w WHERE w.patient_id = ? AND w.scheduled_on BETWEEN ? AND ?
     ORDER BY w.scheduled_on, w.created_at`,
  )
    .bind(patient.id, from, to)
    .all<Record<string, unknown> & { id: string }>();
  if (!workouts.length) return c.json([]);
  const { results: items } = await c.env.DB.prepare(
    `SELECT wi.workout_id, wi.id, wi.block, wi.done, wi.exercise_id, wi.instructions, wi.position, wi.result, wi.pain,
            e.name, e.video_key, e.video_url FROM workout_items wi
     JOIN exercises e ON e.id = wi.exercise_id
     WHERE wi.workout_id IN (SELECT id FROM workouts WHERE patient_id = ? AND scheduled_on BETWEEN ? AND ?)
     ORDER BY wi.position`,
  )
    .bind(patient.id, from, to)
    .all<{ workout_id: string }>();
  return c.json(workouts.map((w) => ({ ...w, items: items.filter((i) => i.workout_id === w.id) })));
});

async function loadWorkout(c: Parameters<typeof patientFor>[0], workoutId: string) {
  const w = await c.env.DB.prepare("SELECT * FROM workouts WHERE id = ?").bind(workoutId).first<{
    id: string;
    patient_id: string;
    therapist_id: string;
  }>();
  if (!w) fail(404, "Workout not found");
  await patientFor(c, w.patient_id);
  return w;
}

app.get("/workouts/:id", async (c) => {
  const w = await loadWorkout(c, c.req.param("id"));
  const [{ results: items }, { results: comments }] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT wi.*, e.name, e.description, e.video_key, e.video_url, e.body_area,
         (SELECT COUNT(*) FROM workout_items h JOIN workouts hw ON hw.id = h.workout_id
          WHERE h.exercise_id = wi.exercise_id AND hw.patient_id = ? AND h.done = 1 AND h.id != wi.id) AS times_done
       FROM workout_items wi JOIN exercises e ON e.id = wi.exercise_id
       WHERE wi.workout_id = ? ORDER BY wi.position`,
    ).bind(w.patient_id, w.id),
    c.env.DB.prepare(
      `SELECT wc.id, wc.body, wc.created_at, wc.author_id, u.name AS author_name, u.role AS author_role
       FROM workout_comments wc JOIN users u ON u.id = wc.author_id
       WHERE wc.workout_id = ? ORDER BY wc.created_at`,
    ).bind(w.id),
  ]);
  return c.json({ ...w, items, comments });
});

type ItemInput = { id?: string; exercise_id: string; block: string; instructions: string | null };

function parseItems(raw: unknown): ItemInput[] {
  if (!Array.isArray(raw)) fail(400, "Items are required");
  return raw.map((r) => {
    const item = r as Record<string, unknown>;
    if (typeof item.exercise_id !== "string") fail(400, "Each item needs an exercise");
    const block = str(item.block, 4)?.toUpperCase();
    if (!block || !/^[A-Z]{1,2}$/.test(block)) fail(400, "Block must be a letter like A");
    return {
      id: typeof item.id === "string" ? item.id : undefined,
      exercise_id: item.exercise_id,
      block,
      instructions: str(item.instructions, 500),
    };
  });
}

async function checkExercises(c: Parameters<typeof patientFor>[0], items: ItemInput[], therapistId: string) {
  const ids = [...new Set(items.map((i) => i.exercise_id))];
  if (!ids.length) return;
  const { results } = await c.env.DB.prepare(
    `SELECT id FROM exercises WHERE id IN (${ids.map(() => "?").join(",")}) AND (therapist_id IS NULL OR therapist_id = ?)`,
  )
    .bind(...ids, therapistId)
    .all();
  if (results.length !== ids.length) fail(400, "Unknown exercise in workout");
}

app.post("/workouts", async (c) => {
  const user = requireTherapist(c);
  const b = await body(c);
  const patient = await patientFor(c, typeof b.patientId === "string" ? b.patientId : null);
  const title = str(b.title, 120);
  if (!title) fail(400, "Workout title is required");
  if (!isDate(b.scheduled_on)) fail(400, "A date is required");
  const items = parseItems(b.items);
  await checkExercises(c, items, user.id);
  const workoutId = id();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO workouts (id, patient_id, therapist_id, scheduled_on, title, notes, template_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(workoutId, patient.id, user.id, b.scheduled_on, title, str(b.notes), typeof b.template_id === "string" ? b.template_id : null),
    ...items.map((it, i) =>
      c.env.DB.prepare(
        "INSERT INTO workout_items (id, workout_id, exercise_id, position, block, instructions) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(id(), workoutId, it.exercise_id, i, it.block, it.instructions),
    ),
  ]);
  return c.json({ id: workoutId });
});

app.put("/workouts/:id", async (c) => {
  const user = requireTherapist(c);
  const w = await loadWorkout(c, c.req.param("id"));
  const b = await body(c);
  const title = str(b.title, 120);
  if (!title) fail(400, "Workout title is required");
  if (!isDate(b.scheduled_on)) fail(400, "A date is required");
  const items = parseItems(b.items);
  await checkExercises(c, items, user.id);
  // Only ids that really belong to this workout are kept; anything else is treated as new.
  const { results: existing } = await c.env.DB.prepare("SELECT id FROM workout_items WHERE workout_id = ?").bind(w.id).all<{ id: string }>();
  const existingIds = new Set(existing.map((r) => r.id));
  for (const it of items) if (it.id && !existingIds.has(it.id)) it.id = undefined;
  const keep = items.filter((i) => i.id).map((i) => i.id!);
  const newIds = items.map((it) => it.id ?? id());
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE workouts SET title = ?, scheduled_on = ?, notes = ? WHERE id = ?").bind(
      title, b.scheduled_on, str(b.notes), w.id,
    ),
    // Items the therapist kept keep their logged results; removed ones are dropped.
    c.env.DB.prepare(
      `DELETE FROM workout_items WHERE workout_id = ?${keep.length ? ` AND id NOT IN (${keep.map(() => "?").join(",")})` : ""}`,
    ).bind(w.id, ...keep),
    ...items.map((it, i) =>
      it.id
        ? c.env.DB.prepare(
            "UPDATE workout_items SET exercise_id = ?, position = ?, block = ?, instructions = ? WHERE id = ? AND workout_id = ?",
          ).bind(it.exercise_id, i, it.block, it.instructions, it.id, w.id)
        : c.env.DB.prepare(
            "INSERT INTO workout_items (id, workout_id, exercise_id, position, block, instructions) VALUES (?, ?, ?, ?, ?, ?)",
          ).bind(newIds[i], w.id, it.exercise_id, i, it.block, it.instructions),
    ),
  ]);
  return c.json({ ok: true, itemIds: newIds });
});

app.delete("/workouts/:id", async (c) => {
  requireTherapist(c);
  const w = await loadWorkout(c, c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM workouts WHERE id = ?").bind(w.id).run();
  return c.json({ ok: true });
});

/** Copies a workout (without results) to other dates, optionally for another patient. */
app.post("/workouts/:id/copy", async (c) => {
  const user = requireTherapist(c);
  const w = await loadWorkout(c, c.req.param("id"));
  const b = await body(c);
  const dates = Array.isArray(b.dates) ? b.dates.filter(isDate) : [];
  if (!dates.length || dates.length > 60) fail(400, "Pick between 1 and 60 dates");
  const target = await patientFor(c, typeof b.patientId === "string" ? b.patientId : w.patient_id);
  const src = await c.env.DB.prepare("SELECT * FROM workouts WHERE id = ?").bind(w.id).first<{ title: string; notes: string | null }>();
  const { results: items } = await c.env.DB.prepare(
    "SELECT exercise_id, position, block, instructions FROM workout_items WHERE workout_id = ? ORDER BY position",
  )
    .bind(w.id)
    .all<{ exercise_id: string; position: number; block: string; instructions: string | null }>();
  const stmts: D1PreparedStatement[] = [];
  const created: string[] = [];
  for (const date of dates) {
    const newId = id();
    created.push(newId);
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO workouts (id, patient_id, therapist_id, scheduled_on, title, notes) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(newId, target.id, user.id, date, src!.title, src!.notes),
      ...items.map((it) =>
        c.env.DB.prepare(
          "INSERT INTO workout_items (id, workout_id, exercise_id, position, block, instructions) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(id(), newId, it.exercise_id, it.position, it.block, it.instructions),
      ),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ ids: created });
});

app.patch("/workouts/:id/items/:itemId", async (c) => {
  const w = await loadWorkout(c, c.req.param("id"));
  const b = await body(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if ("result" in b) sets.push("result = ?"), vals.push(str(b.result));
  if ("pain" in b) sets.push("pain = ?"), vals.push(painScore(b.pain));
  if ("done" in b) sets.push("done = ?"), vals.push(b.done ? 1 : 0);
  if ("result_media_key" in b) {
    const key = str(b.result_media_key, 300);
    if (key && !key.startsWith(c.get("user").id + "/")) fail(400, "Unknown upload");
    sets.push("result_media_key = ?", "result_media_type = ?");
    vals.push(key, key ? str(b.result_media_type, 100) : null);
  }
  if (!sets.length) return c.json({ ok: true });
  const res = await c.env.DB.prepare(`UPDATE workout_items SET ${sets.join(", ")} WHERE id = ? AND workout_id = ?`)
    .bind(...vals, c.req.param("itemId"), w.id)
    .run();
  if (!res.meta.changes) fail(404, "Exercise not found in this workout");
  return c.json({ ok: true });
});

app.post("/workouts/:id/complete", async (c) => {
  const w = await loadWorkout(c, c.req.param("id"));
  const b = await body(c);
  const done = b.completed !== false;
  await c.env.DB.prepare(
    "UPDATE workouts SET completed_at = ?, pain_before = COALESCE(?, pain_before), pain_after = COALESCE(?, pain_after) WHERE id = ?",
  )
    .bind(done ? new Date().toISOString() : null, painScore(b.pain_before), painScore(b.pain_after), w.id)
    .run();
  const comment = str(b.comment);
  if (comment)
    await c.env.DB.prepare("INSERT INTO workout_comments (id, workout_id, author_id, body) VALUES (?, ?, ?, ?)")
      .bind(id(), w.id, c.get("user").id, comment)
      .run();
  return c.json({ ok: true });
});

app.post("/workouts/:id/comments", async (c) => {
  const user = c.get("user");
  const w = await loadWorkout(c, c.req.param("id"));
  const text = str((await body(c)).body);
  if (!text) fail(400, "Comment is empty");
  const stmts = [
    c.env.DB.prepare("INSERT INTO workout_comments (id, workout_id, author_id, body) VALUES (?, ?, ?, ?)").bind(id(), w.id, user.id, text),
  ];
  // A coach reply clears the patient's comments on this workout from the inbox.
  if (user.role === "therapist")
    stmts.push(
      c.env.DB.prepare("UPDATE workout_comments SET handled_at = datetime('now') WHERE workout_id = ? AND author_id != ? AND handled_at IS NULL").bind(w.id, user.id),
    );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// ---------- Messages ----------

app.get("/messages", async (c) => {
  const user = c.get("user");
  const patient = await patientFor(c, c.req.query("patientId"));
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.body, m.created_at, m.read_at, m.sender_id, u.name AS sender_name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.patient_id = ? ORDER BY m.created_at DESC LIMIT 200`,
  )
    .bind(patient.id)
    .all();
  await c.env.DB.prepare("UPDATE messages SET read_at = ? WHERE patient_id = ? AND sender_id != ? AND read_at IS NULL")
    .bind(new Date().toISOString(), patient.id, user.id)
    .run();
  return c.json(results.reverse());
});

app.post("/messages", async (c) => {
  const b = await body(c);
  const patient = await patientFor(c, typeof b.patientId === "string" ? b.patientId : null);
  const text = str(b.body);
  if (!text) fail(400, "Message is empty");
  await c.env.DB.prepare("INSERT INTO messages (id, patient_id, sender_id, body) VALUES (?, ?, ?, ?)")
    .bind(id(), patient.id, c.get("user").id, text)
    .run();
  return c.json({ ok: true });
});

app.get("/unread", async (c) => {
  const user = c.get("user");
  const row =
    user.role === "patient"
      ? await c.env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE patient_id = ? AND sender_id != ? AND read_at IS NULL")
          .bind(user.id, user.id)
          .first<{ n: number }>()
      : await c.env.DB.prepare(
          `SELECT COUNT(*) AS n FROM messages m JOIN users p ON p.id = m.patient_id
           WHERE p.therapist_id = ? AND m.sender_id = p.id AND m.read_at IS NULL`,
        )
          .bind(user.id)
          .first<{ n: number }>();
  return c.json({ messages: row?.n ?? 0 });
});

// ---------- Metrics ----------

app.get("/metrics", async (c) => {
  const patient = await patientFor(c, c.req.query("patientId"));
  const from = addDays(today(), -180);
  const { results: workouts } = await c.env.DB.prepare(
    `SELECT scheduled_on, completed_at, pain_before, pain_after FROM workouts
     WHERE patient_id = ? AND scheduled_on >= ? AND scheduled_on <= ? ORDER BY scheduled_on`,
  )
    .bind(patient.id, from, today())
    .all<{ scheduled_on: string; completed_at: string | null; pain_before: number | null; pain_after: number | null }>();
  const total = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM workouts WHERE patient_id = ? AND completed_at IS NOT NULL")
    .bind(patient.id)
    .first<{ n: number }>();

  // Streak: consecutive scheduled workouts (most recent first, ignoring today's if still open) that were completed.
  let streak = 0;
  for (let i = workouts.length - 1; i >= 0; i--) {
    const w = workouts[i];
    if (w.scheduled_on === today() && !w.completed_at) continue;
    if (!w.completed_at) break;
    streak++;
  }
  return c.json({ workouts, total_completed: total?.n ?? 0, streak });
});

// ---------- Therapist activity feed ----------

app.get("/activity", async (c) => {
  const user = requireTherapist(c);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM (
       SELECT 'completed' AS kind, w.completed_at AS at, w.id AS workout_id, w.title AS title, NULL AS body,
              p.id AS patient_id, p.name AS patient_name, w.pain_before, w.pain_after
       FROM workouts w JOIN users p ON p.id = w.patient_id
       WHERE w.therapist_id = ? AND w.completed_at IS NOT NULL
       UNION ALL
       SELECT 'comment', wc.created_at, w.id, w.title, wc.body, p.id, p.name, NULL, NULL
       FROM workout_comments wc JOIN workouts w ON w.id = wc.workout_id JOIN users p ON p.id = w.patient_id
       WHERE w.therapist_id = ? AND wc.author_id = p.id
       UNION ALL
       SELECT 'message', m.created_at, NULL, NULL, m.body, p.id, p.name, NULL, NULL
       FROM messages m JOIN users p ON p.id = m.patient_id
       WHERE p.therapist_id = ? AND m.sender_id = p.id
     ) ORDER BY at DESC LIMIT 40`,
  )
    .bind(user.id, user.id, user.id)
    .all();
  return c.json(results);
});

// ---------- Workout CRM: templates ----------

app.get("/templates", async (c) => {
  const user = requireTherapist(c);
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.notes, t.folder, t.tags, t.created_at, t.updated_at,
       (SELECT COUNT(*) FROM workouts w WHERE w.template_id = t.id) AS times_assigned,
       (SELECT MAX(w.scheduled_on) FROM workouts w WHERE w.template_id = t.id AND w.scheduled_on <= date('now')) AS last_assigned_on
     FROM templates t WHERE t.therapist_id = ? ORDER BY t.folder COLLATE NOCASE, t.name COLLATE NOCASE`,
  )
    .bind(user.id)
    .all<{ id: string }>();
  const items = await templateItems(c.env.DB, results.map((t) => t.id));
  return c.json(results.map((t) => ({ ...t, items: items.filter((i) => i.template_id === t.id) })));
});

async function loadTemplate(c: Parameters<typeof patientFor>[0], templateId: string) {
  const user = requireTherapist(c);
  const t = await c.env.DB.prepare("SELECT * FROM templates WHERE id = ? AND therapist_id = ?").bind(templateId, user.id).first<{
    id: string;
    name: string;
    notes: string | null;
  }>();
  if (!t) fail(404, "Template not found");
  return t;
}

function templateWrites(c: Parameters<typeof patientFor>[0], templateId: string, items: ItemInput[]) {
  return [
    c.env.DB.prepare("DELETE FROM template_items WHERE template_id = ?").bind(templateId),
    ...items.map((it, i) =>
      c.env.DB.prepare("INSERT INTO template_items (id, template_id, exercise_id, position, block, instructions) VALUES (?, ?, ?, ?, ?, ?)").bind(
        id(), templateId, it.exercise_id, i, it.block, it.instructions,
      ),
    ),
  ];
}

/** Creates a template from scratch, or from an existing workout with `fromWorkoutId`. */
app.post("/templates", async (c) => {
  const user = requireTherapist(c);
  const b = await body(c);
  let items: ItemInput[];
  let name = str(b.name, 120);
  let notes = str(b.notes);
  if (typeof b.fromWorkoutId === "string") {
    const w = await loadWorkout(c, b.fromWorkoutId);
    const src = await c.env.DB.prepare("SELECT title, notes FROM workouts WHERE id = ?").bind(w.id).first<{ title: string; notes: string | null }>();
    const { results } = await c.env.DB.prepare("SELECT exercise_id, block, instructions FROM workout_items WHERE workout_id = ? ORDER BY position")
      .bind(w.id)
      .all<ItemInput>();
    items = results;
    name ??= src!.title;
    notes ??= src!.notes;
  } else {
    items = parseItems(b.items ?? []);
  }
  if (!name) fail(400, "Template name is required");
  await checkExercises(c, items, user.id);
  const templateId = id();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO templates (id, therapist_id, name, notes, folder, tags) VALUES (?, ?, ?, ?, ?, ?)").bind(
      templateId, user.id, name, notes, str(b.folder, 80), str(b.tags, 300),
    ),
    ...templateWrites(c, templateId, items),
  ]);
  return c.json({ id: templateId });
});

app.put("/templates/:id", async (c) => {
  const user = requireTherapist(c);
  const t = await loadTemplate(c, c.req.param("id"));
  const b = await body(c);
  const name = str(b.name, 120);
  if (!name) fail(400, "Template name is required");
  const items = parseItems(b.items ?? []);
  await checkExercises(c, items, user.id);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE templates SET name = ?, notes = ?, folder = ?, tags = ?, updated_at = datetime('now') WHERE id = ?").bind(
      name, str(b.notes), str(b.folder, 80), str(b.tags, 300), t.id,
    ),
    ...templateWrites(c, t.id, items),
  ]);
  return c.json({ ok: true });
});

app.delete("/templates/:id", async (c) => {
  const t = await loadTemplate(c, c.req.param("id"));
  const used = await c.env.DB.prepare("SELECT 1 FROM program_days WHERE template_id = ? LIMIT 1").bind(t.id).first();
  if (used) fail(409, "This workout is part of a program. Remove it from the program first.");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE workouts SET template_id = NULL WHERE template_id = ?").bind(t.id),
    c.env.DB.prepare("DELETE FROM template_items WHERE template_id = ?").bind(t.id),
    c.env.DB.prepare("DELETE FROM templates WHERE id = ?").bind(t.id),
  ]);
  return c.json({ ok: true });
});

app.post("/templates/:id/assign", async (c) => {
  const user = requireTherapist(c);
  const t = await loadTemplate(c, c.req.param("id"));
  const b = await body(c);
  const patient = await patientFor(c, typeof b.patientId === "string" ? b.patientId : null);
  const dates = Array.isArray(b.dates) ? b.dates.filter(isDate) : [];
  if (!dates.length || dates.length > 60) fail(400, "Pick between 1 and 60 dates");
  const items = await templateItems(c.env.DB, [t.id]);
  const stmts: D1PreparedStatement[] = [];
  const ids: string[] = [];
  for (const date of dates) {
    const a = assignStatements(c.env.DB, { therapistId: user.id, patientId: patient.id, templateId: t.id, programId: null, date, title: t.name, notes: t.notes }, items as never);
    ids.push(a.workoutId);
    stmts.push(...a.stmts);
  }
  await c.env.DB.batch(stmts);
  return c.json({ ids });
});

// ---------- Workout CRM: programs (phases) ----------

app.get("/programs", async (c) => {
  const user = requireTherapist(c);
  const { results: programs } = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(DISTINCT w.patient_id) FROM workouts w WHERE w.program_id = p.id) AS patients_assigned
     FROM programs p WHERE p.therapist_id = ? ORDER BY p.created_at DESC`,
  )
    .bind(user.id)
    .all<{ id: string }>();
  const { results: days } = await c.env.DB.prepare(
    `SELECT d.program_id, d.week, d.day, d.template_id, t.name AS template_name,
       (SELECT COUNT(*) FROM template_items ti WHERE ti.template_id = t.id) AS item_count
     FROM program_days d JOIN templates t ON t.id = d.template_id JOIN programs p ON p.id = d.program_id
     WHERE p.therapist_id = ? ORDER BY d.week, d.day`,
  )
    .bind(user.id)
    .all<{ program_id: string }>();
  return c.json(programs.map((p) => ({ ...p, days: days.filter((d) => d.program_id === p.id) })));
});

function parseProgram(b: Record<string, unknown>) {
  const name = str(b.name, 120);
  if (!name) fail(400, "Program name is required");
  const weeks = Number(b.weeks);
  const dpw = Number(b.days_per_week);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 16) fail(400, "Weeks must be 1 to 16");
  if (!Number.isInteger(dpw) || dpw < 1 || dpw > 7) fail(400, "Days per week must be 1 to 7");
  const days = (Array.isArray(b.days) ? b.days : [])
    .map((d) => d as { week: number; day: number; template_id: string })
    .filter((d) => typeof d.template_id === "string" && d.week >= 1 && d.week <= weeks && d.day >= 1 && d.day <= dpw);
  return { name, description: str(b.description), weeks, dpw, days };
}

async function checkTemplates(c: Parameters<typeof patientFor>[0], ids: string[], therapistId: string) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const { results } = await c.env.DB.prepare(
    `SELECT id FROM templates WHERE therapist_id = ? AND id IN (${unique.map(() => "?").join(",")})`,
  )
    .bind(therapistId, ...unique)
    .all();
  if (results.length !== unique.length) fail(400, "Unknown workout in program");
}

app.post("/programs", async (c) => {
  const user = requireTherapist(c);
  const p = parseProgram(await body(c));
  await checkTemplates(c, p.days.map((d) => d.template_id), user.id);
  const programId = id();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO programs (id, therapist_id, name, description, weeks, days_per_week) VALUES (?, ?, ?, ?, ?, ?)").bind(
      programId, user.id, p.name, p.description, p.weeks, p.dpw,
    ),
    ...p.days.map((d) =>
      c.env.DB.prepare("INSERT INTO program_days (program_id, week, day, template_id) VALUES (?, ?, ?, ?)").bind(programId, d.week, d.day, d.template_id),
    ),
  ]);
  return c.json({ id: programId });
});

app.put("/programs/:id", async (c) => {
  const user = requireTherapist(c);
  const existing = await c.env.DB.prepare("SELECT id FROM programs WHERE id = ? AND therapist_id = ?").bind(c.req.param("id"), user.id).first();
  if (!existing) fail(404, "Program not found");
  const p = parseProgram(await body(c));
  await checkTemplates(c, p.days.map((d) => d.template_id), user.id);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE programs SET name = ?, description = ?, weeks = ?, days_per_week = ?, updated_at = datetime('now') WHERE id = ?").bind(
      p.name, p.description, p.weeks, p.dpw, c.req.param("id"),
    ),
    c.env.DB.prepare("DELETE FROM program_days WHERE program_id = ?").bind(c.req.param("id")),
    ...p.days.map((d) =>
      c.env.DB.prepare("INSERT INTO program_days (program_id, week, day, template_id) VALUES (?, ?, ?, ?)").bind(c.req.param("id"), d.week, d.day, d.template_id),
    ),
  ]);
  return c.json({ ok: true });
});

app.delete("/programs/:id", async (c) => {
  const user = requireTherapist(c);
  const sold = await c.env.DB.prepare("SELECT title FROM courses WHERE program_id = ? AND therapist_id = ? LIMIT 1").bind(c.req.param("id"), user.id).first<{ title: string }>();
  if (sold) fail(409, `This program is sold as the course "${sold.title}". Delete the course first.`);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE workouts SET program_id = NULL WHERE program_id = ? AND therapist_id = ?").bind(c.req.param("id"), user.id),
    c.env.DB.prepare("DELETE FROM program_days WHERE program_id IN (SELECT id FROM programs WHERE id = ? AND therapist_id = ?)").bind(c.req.param("id"), user.id),
    c.env.DB.prepare("DELETE FROM programs WHERE id = ? AND therapist_id = ?").bind(c.req.param("id"), user.id),
  ]);
  return c.json({ ok: true });
});

/**
 * Schedules a whole program for a patient. `weekdays` are 0-6 (Sunday = 0), one per program day;
 * workouts are titled like TrueCoach: "Phase 14 Week 2 Day 1".
 */
app.post("/programs/:id/assign", async (c) => {
  const user = requireTherapist(c);
  const program = await c.env.DB.prepare("SELECT * FROM programs WHERE id = ? AND therapist_id = ?")
    .bind(c.req.param("id"), user.id)
    .first<{ id: string; name: string; weeks: number; days_per_week: number }>();
  if (!program) fail(404, "Program not found");
  const b = await body(c);
  const patient = await patientFor(c, typeof b.patientId === "string" ? b.patientId : null);
  if (!isDate(b.startDate)) fail(400, "Pick a start date");
  const { stmts, created } = await scheduleProgram(c.env.DB, {
    therapistId: user.id,
    patientId: patient.id,
    programId: program.id,
    startDate: b.startDate,
    weekdays: parseWeekdays(b.weekdays, program.days_per_week),
  });
  await c.env.DB.batch(stmts);
  return c.json({ created });
});

/** Every workout this coach has built, newest first, searchable by title, exercise, or patient. */
app.get("/history", async (c) => {
  const user = requireTherapist(c);
  const qtext = (c.req.query("q") ?? "").trim().toLowerCase();
  const like = `%${qText(qtext)}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.title, w.scheduled_on, w.completed_at, w.pain_after, w.template_id, p.id AS patient_id, p.name AS patient_name,
       (SELECT GROUP_CONCAT(e.name, ' · ') FROM (SELECT e.name FROM workout_items wi JOIN exercises e ON e.id = wi.exercise_id WHERE wi.workout_id = w.id ORDER BY wi.position) e) AS exercise_names,
       (SELECT COUNT(*) FROM workout_items wi WHERE wi.workout_id = w.id) AS item_count
     FROM workouts w JOIN users p ON p.id = w.patient_id
     WHERE w.therapist_id = ? AND (? = '%%' OR LOWER(w.title) LIKE ? OR LOWER(p.name) LIKE ? OR EXISTS (
       SELECT 1 FROM workout_items wi JOIN exercises e ON e.id = wi.exercise_id WHERE wi.workout_id = w.id AND LOWER(e.name) LIKE ?))
     ORDER BY w.scheduled_on DESC LIMIT 200`,
  )
    .bind(user.id, like, like, like, like)
    .all();
  return c.json(results);
});

const qText = (s: string) => s.replace(/[%_]/g, "");

// ---------- Client CRM: pipeline, engagement, churn ----------

app.get("/crm", async (c) => {
  const user = requireTherapist(c);
  const t = today();
  const d14 = addDays(t, -14);
  const d28 = addDays(t, -28);
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.email, p.diagnosis, p.stage, p.stage_changed_at, p.source, p.phone, p.monthly_rate, p.follow_up_on,
       p.invite_code, p.created_at, p.archived,
       (SELECT COUNT(*) FROM workouts w WHERE w.patient_id = p.id AND w.scheduled_on BETWEEN ? AND ?) AS scheduled_14d,
       (SELECT COUNT(*) FROM workouts w WHERE w.patient_id = p.id AND w.scheduled_on BETWEEN ? AND ? AND w.completed_at IS NOT NULL) AS completed_14d,
       (SELECT COUNT(*) FROM workouts w WHERE w.patient_id = p.id AND w.scheduled_on BETWEEN ? AND ?) AS scheduled_prev,
       (SELECT COUNT(*) FROM workouts w WHERE w.patient_id = p.id AND w.scheduled_on BETWEEN ? AND ? AND w.completed_at IS NOT NULL) AS completed_prev,
       (SELECT COUNT(*) FROM workout_comments wc JOIN workouts w ON w.id = wc.workout_id WHERE w.patient_id = p.id AND wc.author_id = p.id AND wc.created_at >= ?) AS comments_14d,
       (SELECT COUNT(*) FROM messages m WHERE m.patient_id = p.id AND m.sender_id = p.id AND m.created_at >= ?) AS messages_14d,
       (SELECT COUNT(*) FROM workout_items wi JOIN workouts w ON w.id = wi.workout_id WHERE w.patient_id = p.id AND w.scheduled_on >= ? AND (wi.result IS NOT NULL OR wi.pain IS NOT NULL)) AS results_14d,
       (SELECT MAX(x) FROM (
          SELECT MAX(w.completed_at) AS x FROM workouts w WHERE w.patient_id = p.id
          UNION ALL SELECT MAX(m.created_at) FROM messages m WHERE m.patient_id = p.id AND m.sender_id = p.id
          UNION ALL SELECT MAX(wc.created_at) FROM workout_comments wc JOIN workouts w ON w.id = wc.workout_id WHERE w.patient_id = p.id AND wc.author_id = p.id
       )) AS last_active_at,
       (SELECT MAX(scheduled_on) FROM workouts w WHERE w.patient_id = p.id) AS last_scheduled_on,
       (SELECT AVG(pain_after) FROM workouts w WHERE w.patient_id = p.id AND w.scheduled_on >= ? AND w.pain_after IS NOT NULL) AS pain_14d,
       (SELECT AVG(pain_after) FROM workouts w WHERE w.patient_id = p.id AND w.scheduled_on BETWEEN ? AND ? AND w.pain_after IS NOT NULL) AS pain_prev
     FROM users p WHERE p.therapist_id = ? AND p.role = 'patient' AND p.archived = 0`,
  )
    .bind(d14, t, d14, t, d28, d14, d28, d14, d14, d14, d14, d14, d28, d14, user.id)
    .all<Record<string, number | string | null>>();
  return c.json(results.map((r) => ({ ...r, ...scoreClient(r, t) })));
});

/**
 * Engagement (0-100) blends adherence, how much they log results and talk, and recency.
 * Churn risk is high when they've gone quiet, adherence is falling off, or there's nothing scheduled.
 */
export function scoreClient(r: Record<string, number | string | null>, t: string) {
  const n = (k: string) => Number(r[k] ?? 0);
  const adherence = n("scheduled_14d") ? n("completed_14d") / n("scheduled_14d") : null;
  const prevAdherence = n("scheduled_prev") ? n("completed_prev") / n("scheduled_prev") : null;
  const lastActive = typeof r.last_active_at === "string" ? r.last_active_at.slice(0, 10) : null;
  const daysQuiet = lastActive ? Math.max(0, Math.round((Date.parse(t) - Date.parse(lastActive)) / 86400_000)) : null;
  const talk = Math.min(1, (n("comments_14d") + n("messages_14d")) / 6);
  const logging = Math.min(1, n("results_14d") / 8);
  const recency = daysQuiet === null ? 0 : Math.max(0, 1 - daysQuiet / 10);
  const engagement = Math.round(((adherence ?? 0) * 0.55 + talk * 0.15 + logging * 0.1 + recency * 0.2) * 100);

  const reasons: string[] = [];
  if (r.stage === "active") {
    if (daysQuiet === null || daysQuiet >= 7) reasons.push(daysQuiet === null ? "Never active" : `Quiet for ${daysQuiet} days`);
    if (adherence !== null && adherence < 0.5) reasons.push(`Adherence ${Math.round(adherence * 100)}%`);
    if (adherence !== null && prevAdherence !== null && prevAdherence - adherence >= 0.3) reasons.push("Adherence dropping");
    if (!r.last_scheduled_on || (r.last_scheduled_on as string) < t) reasons.push("Nothing scheduled");
    if (r.pain_14d !== null && r.pain_prev !== null && Number(r.pain_14d) - Number(r.pain_prev) >= 1.5) reasons.push("Pain rising");
  }
  const churn_risk = r.stage !== "active" ? null : reasons.length >= 2 || (daysQuiet ?? 99) >= 10 ? "high" : reasons.length === 1 ? "medium" : "low";
  return { engagement, adherence_14d: adherence, days_quiet: daysQuiet, churn_risk, risk_reasons: reasons };
}

app.route("/", overview);

// ---------- Coach inbox ----------

app.get("/inbox", async (c) => {
  const user = requireTherapist(c);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM (
       SELECT 'comment' AS kind, wc.id, wc.body, wc.created_at, w.id AS workout_id, w.title, w.scheduled_on, w.completed_at, w.pain_after,
              p.id AS patient_id, p.name AS patient_name
       FROM workout_comments wc JOIN workouts w ON w.id = wc.workout_id JOIN users p ON p.id = w.patient_id
       WHERE w.therapist_id = ? AND wc.author_id = p.id AND wc.handled_at IS NULL
       UNION ALL
       SELECT 'message', m.id, m.body, m.created_at, NULL, NULL, NULL, NULL, NULL, p.id, p.name
       FROM messages m JOIN users p ON p.id = m.patient_id
       WHERE p.therapist_id = ? AND m.sender_id = p.id AND m.read_at IS NULL
       UNION ALL
       SELECT 'completed', w.id, NULL, w.completed_at, w.id, w.title, w.scheduled_on, w.completed_at, w.pain_after, p.id, p.name
       FROM workouts w JOIN users p ON p.id = w.patient_id
       WHERE w.therapist_id = ? AND w.completed_at IS NOT NULL AND w.completed_at >= ?
         AND NOT EXISTS (SELECT 1 FROM workout_comments wc WHERE wc.workout_id = w.id)
     ) ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(user.id, user.id, user.id, addDays(today(), -3))
    .all();
  return c.json(results);
});

/** Marks inbox entries handled without replying. */
app.post("/inbox/dismiss", async (c) => {
  const user = requireTherapist(c);
  const b = await body(c);
  const stmts: D1PreparedStatement[] = [];
  if (typeof b.commentId === "string")
    stmts.push(
      c.env.DB.prepare(
        `UPDATE workout_comments SET handled_at = datetime('now') WHERE id = ? AND workout_id IN (SELECT id FROM workouts WHERE therapist_id = ?)`,
      ).bind(b.commentId, user.id),
    );
  if (typeof b.messageId === "string")
    stmts.push(
      c.env.DB.prepare(
        `UPDATE messages SET read_at = datetime('now') WHERE id = ? AND patient_id IN (SELECT id FROM users WHERE therapist_id = ?)`,
      ).bind(b.messageId, user.id),
    );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// ---------- Media (R2, or KV when R2 isn't enabled) ----------

app.post("/media", async (c) => {
  const user = c.get("user");
  const type = c.req.header("content-type") ?? "";
  if (!/^(image|video)\//.test(type)) fail(400, "Only photos and videos can be uploaded");
  const limit = maxUpload(c.env);
  const length = Number(c.req.header("content-length") ?? 0);
  if (length > limit || !c.req.raw.body) fail(400, `Files can be up to ${limit / 1024 / 1024} MB`);
  const ext = (type.split("/")[1] ?? "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8);
  const key = `${user.id}/${id()}.${ext}`;
  try {
    await putMedia(c.env, key, c.req.raw.body!, type);
  } catch {
    fail(400, `Files can be up to ${limit / 1024 / 1024} MB`);
  }
  return c.json({ key, type });
});

app.get("/media/:owner/:file", async (c) => {
  const key = `${c.req.param("owner")}/${c.req.param("file")}`;
  if (!(await canReadMedia(c.env, c.get("user"), key))) fail(404, "Not found");
  const head = await headMedia(c.env, key);
  if (!head) fail(404, "Not found");
  const { size } = head!;
  const headers = new Headers({
    "content-type": head!.type,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
    etag: head!.etag,
  });
  // Safari needs byte-range support to play video.
  const m = c.req.header("range")?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = size - 1;
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : size - Number(m[2]);
    end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
  }
  const body = await readMedia(c.env, key, start, end);
  if (!body) fail(404, "Not found");
  headers.set("content-length", String(end - start + 1));
  return new Response(body, { status: m && (m[1] || m[2]) ? 206 : 200, headers });
});

// ---------- Demo links: /demo/coach, /demo/client, /demo/client/2 ... ----------

const root = new Hono<AppEnv>();

/** (Re)builds demo data when it's missing or was generated on an earlier day, so "today" always lines up. */
async function ensureDemo(env: AppEnv["Bindings"], force = false) {
  const t = today();
  const seeded = await env.DB.prepare("SELECT value FROM meta WHERE key = 'demo_seeded_on'").first<{ value: string }>();
  if (!force && seeded?.value === t) return;
  const statements = [
    ...demoWipeSql(),
    ...demoSql(t),
    `INSERT INTO meta (key, value) VALUES ('demo_seeded_on', '${t}') ON CONFLICT (key) DO UPDATE SET value = excluded.value;`,
  ];
  // D1's exec takes newline-separated statements.
  await env.DB.exec(statements.join("\n"));
}

const DEMO_CLIENTS = [DEMO_PATIENT_ID, "demo-maya", "demo-jordan", "demo-priya", "demo-sam"];

root.get("/demo/:role/:n?", async (c) => {
  if (c.env.DEMO_MODE !== "true") return c.notFound();
  const role = c.req.param("role");
  if (role === "reset") {
    await ensureDemo(c.env, true);
    return c.redirect("/demo/coach");
  }
  await ensureDemo(c.env);
  const n = Math.max(1, Number(c.req.param("n") ?? 1) || 1);
  const userId = role === "coach" ? DEMO_COACH_ID : role === "client" ? DEMO_CLIENTS[n - 1] : null;
  if (!userId) return c.notFound();
  await startSession(c, userId);
  return c.redirect("/");
});

root.route("/", app);

export default root;
