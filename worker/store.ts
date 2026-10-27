/**
 * Course marketplace. A coach packages one of their programs as a course with a price; buyers check
 * out (simulated for now) and pick a start date and training days, which schedules the program on
 * their calendar like any other workouts.
 */
import type { Context, Hono } from "hono";
import type { AppEnv } from "./util";
import { fail, id, isDate, str } from "./util";
import { currentUser, hashPassword, requireTherapist, startSession } from "./auth";
import { parseWeekdays, scheduleProgram } from "./programs";

type C = Context<AppEnv>;

export const COVERS = ["violet", "teal", "sunset", "ocean", "forest", "slate"];
export const LEVELS = ["All levels", "Beginner", "Intermediate", "Advanced"];

async function readBody(c: C): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// One query shape for every course listing: the course, its program's size, and its sales.
const COURSE_SELECT = `
  SELECT c.id, c.therapist_id, c.program_id, c.title, c.tagline, c.description, c.highlights, c.level, c.price_cents, c.cover,
    c.published, c.created_at, c.updated_at, u.name AS coach_name,
    p.name AS program_name, p.weeks, p.days_per_week,
    (SELECT COUNT(*) FROM program_days d WHERE d.program_id = p.id) AS workout_count,
    (SELECT COUNT(DISTINCT ti.exercise_id) FROM program_days d JOIN template_items ti ON ti.template_id = d.template_id WHERE d.program_id = p.id) AS exercise_count,
    (SELECT COUNT(*) FROM course_purchases cp WHERE cp.course_id = c.id) AS sales,
    (SELECT COALESCE(SUM(cp.price_cents), 0) FROM course_purchases cp WHERE cp.course_id = c.id) AS revenue_cents
  FROM courses c JOIN programs p ON p.id = c.program_id JOIN users u ON u.id = c.therapist_id`;

type CourseRow = { id: string; therapist_id: string; program_id: string; title: string; price_cents: number; published: number; days_per_week: number };

/** Week-by-week outline of a course's program with the exercises in each day. */
async function outline(c: C, programId: string) {
  const { results: days } = await c.env.DB.prepare(
    `SELECT d.week, d.day, d.template_id, t.name AS template_name FROM program_days d JOIN templates t ON t.id = d.template_id
     WHERE d.program_id = ? ORDER BY d.week, d.day`,
  )
    .bind(programId)
    .all<{ week: number; day: number; template_id: string; template_name: string }>();
  const templateIds = [...new Set(days.map((d) => d.template_id))];
  const { results: items } = templateIds.length
    ? await c.env.DB.prepare(
        `SELECT ti.template_id, ti.block, ti.instructions, e.id AS exercise_id, e.name, e.body_area, e.description, e.video_url,
           (e.video_key IS NOT NULL OR e.video_url IS NOT NULL) AS has_video
         FROM template_items ti JOIN exercises e ON e.id = ti.exercise_id
         WHERE ti.template_id IN (${templateIds.map(() => "?").join(",")}) ORDER BY ti.position`,
      )
        .bind(...templateIds)
        .all<{ template_id: string; exercise_id: string; name: string; body_area: string | null }>()
    : { results: [] };
  const exercises = new Map<string, (typeof items)[number]>();
  for (const it of items) if (!exercises.has(it.exercise_id)) exercises.set(it.exercise_id, it);
  return {
    days: days.map((d) => ({ week: d.week, day: d.day, title: d.template_name, items: items.filter((i) => i.template_id === d.template_id) })),
    exercises: [...exercises.values()].map(({ template_id: _t, ...e }) => e),
    body_areas: [...new Set(items.map((i) => i.body_area).filter(Boolean))],
  };
}

function parseCourse(b: Record<string, unknown>) {
  const title = str(b.title, 120);
  if (!title) fail(400, "Give the course a title");
  if (typeof b.program_id !== "string") fail(400, "Pick the program this course delivers");
  const price = Number(b.price_cents);
  if (!Number.isInteger(price) || price < 0 || price > 1_000_000) fail(400, "Price must be between $0 and $10,000");
  const level = typeof b.level === "string" && LEVELS.includes(b.level) ? b.level : "All levels";
  const cover = typeof b.cover === "string" && COVERS.includes(b.cover) ? b.cover : "violet";
  return {
    title,
    program_id: b.program_id,
    tagline: str(b.tagline, 160),
    description: str(b.description, 4000),
    highlights: str(b.highlights, 2000),
    level,
    cover,
    price_cents: price,
    published: b.published ? 1 : 0,
  };
}

/** Very loose card check for the simulated checkout. 4000 0000 0000 0002 declines, like Stripe's test card. */
function checkCard(raw: unknown) {
  const digits = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  if (digits.length < 13 || digits.length > 19) fail(400, "Enter a card number");
  if (digits === "4000000000000002") fail(400, "Your card was declined. Try 4242 4242 4242 4242.");
}

/** Routes anyone can reach, so a coach can share their store link with people who aren't clients yet. */
export function publicStoreRoutes(app: Hono<AppEnv>) {
  app.get("/store/:coachId", async (c) => {
    const coach = await c.env.DB.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'therapist' AND archived = 0")
      .bind(c.req.param("coachId"))
      .first<{ id: string; name: string }>();
    if (!coach) fail(404, "Store not found");
    const user = await currentUser(c);
    const { results } = await c.env.DB.prepare(`${COURSE_SELECT} WHERE c.therapist_id = ? AND c.published = 1 ORDER BY c.price_cents DESC`)
      .bind(coach.id)
      .all<{ id: string }>();
    const owned = user
      ? (await c.env.DB.prepare("SELECT course_id, id FROM course_purchases WHERE buyer_id = ?").bind(user.id).all<{ course_id: string; id: string }>()).results
      : [];
    return c.json({
      coach,
      courses: results.map((r) => ({ ...r, purchase_id: owned.find((o) => o.course_id === r.id)?.id ?? null })),
    });
  });

  app.get("/store/:coachId/courses/:courseId", async (c) => {
    const user = await currentUser(c);
    const course = await c.env.DB.prepare(`${COURSE_SELECT} WHERE c.id = ? AND c.therapist_id = ?`)
      .bind(c.req.param("courseId"), c.req.param("coachId"))
      .first<CourseRow>();
    // Coaches can preview their own unpublished courses.
    if (!course || (!course.published && user?.id !== course.therapist_id)) fail(404, "Course not found");
    const purchase = user
      ? await c.env.DB.prepare("SELECT id FROM course_purchases WHERE course_id = ? AND buyer_id = ?").bind(course.id, user.id).first<{ id: string }>()
      : null;
    return c.json({ ...course, ...(await outline(c, course.program_id)), purchase_id: purchase?.id ?? null });
  });

  /**
   * Simulated checkout. A signed-in client of this coach buys as themselves; anyone else creates a
   * client account under the coach at the same time, which also lands them in the coach's CRM.
   */
  app.post("/store/:coachId/courses/:courseId/checkout", async (c) => {
    const course = await c.env.DB.prepare("SELECT id, therapist_id, title, price_cents, published FROM courses WHERE id = ? AND therapist_id = ?")
      .bind(c.req.param("courseId"), c.req.param("coachId"))
      .first<{ id: string; therapist_id: string; title: string; price_cents: number; published: number }>();
    if (!course?.published) fail(404, "Course not found");
    const b = await readBody(c);
    const user = await currentUser(c);
    let buyerId: string;
    if (user) {
      if (user.role !== "patient") fail(403, "Coaches can't buy courses. Open the store link signed out to try checkout.");
      if (user.therapist_id !== course.therapist_id) fail(403, "This store belongs to a different coach");
      buyerId = user.id;
      const owned = await c.env.DB.prepare("SELECT id FROM course_purchases WHERE course_id = ? AND buyer_id = ?").bind(course.id, buyerId).first<{ id: string }>();
      if (owned) return c.json({ purchaseId: owned.id, already: true });
    } else {
      const name = str(b.name, 100);
      const email = str(b.email, 200)?.toLowerCase();
      const password = typeof b.password === "string" ? b.password : "";
      if (!name || !email || !email.includes("@")) fail(400, "Name and a valid email are required");
      if (password.length < 8) fail(400, "Password must be at least 8 characters");
      const existing = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
      if (existing) fail(409, "You already have an account. Sign in first, then come back to this page.");
      buyerId = id();
      const { hash, salt } = await hashPassword(password);
      await c.env.DB.prepare(
        "INSERT INTO users (id, role, name, email, password_hash, password_salt, therapist_id, stage, source, goals) VALUES (?, 'patient', ?, ?, ?, ?, ?, 'active', 'Course store', ?)",
      )
        .bind(buyerId, name, email, hash, salt, course.therapist_id, `Bought "${course.title}"`)
        .run();
    }
    if (course.price_cents > 0) checkCard(b.card);
    const purchaseId = id();
    await c.env.DB.prepare("INSERT INTO course_purchases (id, course_id, buyer_id, price_cents, payment_ref) VALUES (?, ?, ?, ?, ?)")
      .bind(purchaseId, course.id, buyerId, course.price_cents, course.price_cents > 0 ? `demo_${purchaseId.slice(0, 8)}` : "free")
      .run();
    if (!user) await startSession(c, buyerId);
    return c.json({ purchaseId });
  });
}

/** Routes for signed-in coaches (managing courses and sales) and clients (their purchased courses). */
export function storeRoutes(app: Hono<AppEnv>) {
  app.get("/courses", async (c) => {
    const user = requireTherapist(c);
    const { results } = await c.env.DB.prepare(`${COURSE_SELECT} WHERE c.therapist_id = ? ORDER BY c.published DESC, c.updated_at DESC`)
      .bind(user.id)
      .all();
    const { results: sales } = await c.env.DB.prepare(
      `SELECT cp.id, cp.price_cents, cp.created_at, cp.started_on, c.id AS course_id, c.title AS course_title, b.id AS buyer_id, b.name AS buyer_name,
         (SELECT COUNT(*) FROM workouts w WHERE w.purchase_id = cp.id) AS total,
         (SELECT COUNT(*) FROM workouts w WHERE w.purchase_id = cp.id AND w.completed_at IS NOT NULL) AS done
       FROM course_purchases cp JOIN courses c ON c.id = cp.course_id JOIN users b ON b.id = cp.buyer_id
       WHERE c.therapist_id = ? ORDER BY cp.created_at DESC LIMIT 100`,
    )
      .bind(user.id)
      .all<{ price_cents: number; created_at: string }>();
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().replace("T", " ").slice(0, 19);
    return c.json({
      courses: results,
      sales,
      totals: {
        revenue_cents: sales.reduce((s, x) => s + x.price_cents, 0),
        revenue_30d_cents: sales.filter((x) => x.created_at >= since).reduce((s, x) => s + x.price_cents, 0),
        sales: sales.length,
      },
    });
  });

  async function checkProgram(c: C, programId: string, therapistId: string) {
    const p = await c.env.DB.prepare("SELECT 1 FROM programs WHERE id = ? AND therapist_id = ?").bind(programId, therapistId).first();
    if (!p) fail(400, "Pick one of your programs");
  }

  app.post("/courses", async (c) => {
    const user = requireTherapist(c);
    const p = parseCourse(await readBody(c));
    await checkProgram(c, p.program_id, user.id);
    const courseId = id();
    await c.env.DB.prepare(
      "INSERT INTO courses (id, therapist_id, program_id, title, tagline, description, highlights, level, cover, price_cents, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(courseId, user.id, p.program_id, p.title, p.tagline, p.description, p.highlights, p.level, p.cover, p.price_cents, p.published)
      .run();
    return c.json({ id: courseId });
  });

  app.put("/courses/:id", async (c) => {
    const user = requireTherapist(c);
    const p = parseCourse(await readBody(c));
    await checkProgram(c, p.program_id, user.id);
    const r = await c.env.DB.prepare(
      `UPDATE courses SET program_id = ?, title = ?, tagline = ?, description = ?, highlights = ?, level = ?, cover = ?, price_cents = ?, published = ?,
         updated_at = datetime('now') WHERE id = ? AND therapist_id = ?`,
    )
      .bind(p.program_id, p.title, p.tagline, p.description, p.highlights, p.level, p.cover, p.price_cents, p.published, c.req.param("id"), user.id)
      .run();
    if (!r.meta.changes) fail(404, "Course not found");
    return c.json({ ok: true });
  });

  app.delete("/courses/:id", async (c) => {
    const user = requireTherapist(c);
    const sold = await c.env.DB.prepare("SELECT 1 FROM course_purchases WHERE course_id = ? LIMIT 1").bind(c.req.param("id")).first();
    if (sold) fail(409, "Someone has bought this course, so it can't be deleted. Unpublish it to take it off your store.");
    await c.env.DB.prepare("DELETE FROM courses WHERE id = ? AND therapist_id = ?").bind(c.req.param("id"), user.id).run();
    return c.json({ ok: true });
  });

  // ---- Client side: purchased courses ----

  const PURCHASE_SELECT = `
    SELECT cp.id, cp.price_cents, cp.created_at, cp.started_on, c.id AS course_id, c.title, c.tagline, c.cover, c.level,
      c.therapist_id, p.weeks, p.days_per_week, u.name AS coach_name,
      (SELECT COUNT(*) FROM workouts w WHERE w.purchase_id = cp.id) AS total,
      (SELECT COUNT(*) FROM workouts w WHERE w.purchase_id = cp.id AND w.completed_at IS NOT NULL) AS done,
      (SELECT MAX(w.scheduled_on) FROM workouts w WHERE w.purchase_id = cp.id) AS ends_on,
      (SELECT w.id FROM workouts w WHERE w.purchase_id = cp.id AND w.completed_at IS NULL AND w.scheduled_on >= date('now') ORDER BY w.scheduled_on LIMIT 1) AS next_workout_id,
      (SELECT w.scheduled_on FROM workouts w WHERE w.purchase_id = cp.id AND w.completed_at IS NULL AND w.scheduled_on >= date('now') ORDER BY w.scheduled_on LIMIT 1) AS next_on
    FROM course_purchases cp JOIN courses c ON c.id = cp.course_id JOIN programs p ON p.id = c.program_id JOIN users u ON u.id = c.therapist_id`;

  app.get("/purchases", async (c) => {
    const user = c.get("user");
    const { results } = await c.env.DB.prepare(`${PURCHASE_SELECT} WHERE cp.buyer_id = ? ORDER BY cp.created_at DESC`).bind(user.id).all();
    return c.json(results);
  });

  app.get("/purchases/:id", async (c) => {
    const user = c.get("user");
    const p = await c.env.DB.prepare(`${PURCHASE_SELECT} WHERE cp.id = ? AND cp.buyer_id = ?`).bind(c.req.param("id"), user.id).first<{ id: string }>();
    if (!p) fail(404, "Course not found");
    const { results: workouts } = await c.env.DB.prepare(
      "SELECT id, title, scheduled_on, completed_at FROM workouts WHERE purchase_id = ? ORDER BY scheduled_on",
    )
      .bind(p.id)
      .all();
    return c.json({ ...p, workouts });
  });

  /** Puts a purchased course on the buyer's calendar. */
  app.post("/purchases/:id/schedule", async (c) => {
    const user = c.get("user");
    const p = await c.env.DB.prepare(
      `SELECT cp.id, cp.started_on, c.therapist_id, c.program_id, c.title, pr.days_per_week
       FROM course_purchases cp JOIN courses c ON c.id = cp.course_id JOIN programs pr ON pr.id = c.program_id
       WHERE cp.id = ? AND cp.buyer_id = ?`,
    )
      .bind(c.req.param("id"), user.id)
      .first<{ id: string; started_on: string | null; therapist_id: string; program_id: string; title: string; days_per_week: number }>();
    if (!p) fail(404, "Course not found");
    if (p.started_on) fail(409, "This course is already on your calendar");
    const b = await readBody(c);
    if (!isDate(b.startDate)) fail(400, "Pick a start date");
    const { stmts, created } = await scheduleProgram(c.env.DB, {
      therapistId: p.therapist_id,
      patientId: user.id,
      programId: p.program_id,
      startDate: b.startDate,
      weekdays: parseWeekdays(b.weekdays, p.days_per_week),
      purchaseId: p.id,
      title: p.title,
      fromStart: true,
    });
    await c.env.DB.batch([...stmts, c.env.DB.prepare("UPDATE course_purchases SET started_on = ? WHERE id = ?").bind(b.startDate, p.id)]);
    return c.json({ created });
  });
}
