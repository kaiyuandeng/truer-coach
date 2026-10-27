import { addDays, fail, id } from "./util";

/** Template items with their exercise details, in order. */
export async function templateItems(db: D1Database, templateIds: string[]) {
  if (!templateIds.length) return [];
  const { results } = await db
    .prepare(
      `SELECT ti.template_id, ti.id, ti.exercise_id, ti.position, ti.block, ti.instructions, e.name, e.video_key, e.video_url, e.body_area
       FROM template_items ti JOIN exercises e ON e.id = ti.exercise_id
       WHERE ti.template_id IN (${templateIds.map(() => "?").join(",")}) ORDER BY ti.position`,
    )
    .bind(...templateIds)
    .all<{ template_id: string }>();
  return results;
}

export function assignStatements(
  db: D1Database,
  opts: { therapistId: string; patientId: string; templateId: string; programId: string | null; purchaseId?: string | null; date: string; title: string; notes: string | null },
  items: { exercise_id: string; block: string; instructions: string | null }[],
) {
  const workoutId = id();
  return {
    workoutId,
    stmts: [
      db.prepare(
        "INSERT INTO workouts (id, patient_id, therapist_id, scheduled_on, title, notes, template_id, program_id, purchase_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(workoutId, opts.patientId, opts.therapistId, opts.date, opts.title, opts.notes, opts.templateId, opts.programId, opts.purchaseId ?? null),
      ...items.map((it, i) =>
        db.prepare("INSERT INTO workout_items (id, workout_id, exercise_id, position, block, instructions) VALUES (?, ?, ?, ?, ?, ?)").bind(
          id(), workoutId, it.exercise_id, i, it.block, it.instructions,
        ),
      ),
    ],
  };
}

/** Checks a list of training weekdays (0-6, Sunday = 0) and returns them in Monday-first order. */
export function parseWeekdays(raw: unknown, daysPerWeek: number) {
  const weekdays = Array.isArray(raw) ? [...new Set(raw.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  if (weekdays.length !== daysPerWeek) fail(400, `Pick ${daysPerWeek} training days`);
  return weekdays.sort((a, z) => ((a + 6) % 7) - ((z + 6) % 7));
}

/**
 * Builds the statements that schedule a whole program for a patient, one workout per program day.
 * Workouts are titled like TrueCoach: "Phase 14 Week 2 Day 1".
 *
 * By default week 1 starts on the Monday of the start date's week and days before the start date are
 * skipped, which is how a coach slots a new phase into an ongoing plan. With `fromStart`, Day 1 lands
 * on the first training day on or after the start date and nothing is skipped, which suits someone
 * starting a course on their own.
 */
export async function scheduleProgram(
  db: D1Database,
  opts: { therapistId: string; patientId: string; programId: string; startDate: string; weekdays: number[]; purchaseId?: string | null; title?: string; fromStart?: boolean },
) {
  const program = await db.prepare("SELECT id, name, days_per_week FROM programs WHERE id = ? AND therapist_id = ?")
    .bind(opts.programId, opts.therapistId)
    .first<{ id: string; name: string; days_per_week: number }>();
  if (!program) fail(404, "Program not found");
  const { results: days } = await db.prepare("SELECT week, day, template_id FROM program_days WHERE program_id = ?")
    .bind(program.id)
    .all<{ week: number; day: number; template_id: string }>();
  const templateIds = [...new Set(days.map((d) => d.template_id))];
  const items = await templateItems(db, templateIds);
  const { results: notes } = templateIds.length
    ? await db.prepare(`SELECT id, notes FROM templates WHERE id IN (${templateIds.map(() => "?").join(",")})`).bind(...templateIds).all<{ id: string; notes: string | null }>()
    : { results: [] };

  const start = opts.startDate;
  const startDow = (new Date(start + "T00:00:00Z").getUTCDay() + 6) % 7;
  const monday = addDays(start, -startDow);
  // Training dates from the start date onward, in order.
  const startJsDow = new Date(start + "T00:00:00Z").getUTCDay();
  const offsets = opts.weekdays.map((dow) => (dow - startJsDow + 7) % 7).sort((a, z) => a - z);
  const nthTrainingDate = (n: number) => addDays(start, Math.floor(n / offsets.length) * 7 + offsets[n % offsets.length]);
  const stmts: D1PreparedStatement[] = [];
  let created = 0;
  for (const d of days) {
    const date = opts.fromStart
      ? nthTrainingDate((d.week - 1) * program.days_per_week + d.day - 1)
      : addDays(monday, (d.week - 1) * 7 + ((opts.weekdays[d.day - 1] + 6) % 7));
    if (date < start) continue;
    const a = assignStatements(
      db,
      {
        therapistId: opts.therapistId,
        patientId: opts.patientId,
        templateId: d.template_id,
        programId: program.id,
        purchaseId: opts.purchaseId,
        date,
        title: `${opts.title ?? program.name} Week ${d.week} Day ${d.day}`,
        notes: notes.find((n) => n.id === d.template_id)?.notes ?? null,
      },
      items.filter((i) => i.template_id === d.template_id) as never,
    );
    stmts.push(...a.stmts);
    created++;
  }
  if (!created) fail(400, "No program days fall on or after the start date");
  return { stmts, created };
}
