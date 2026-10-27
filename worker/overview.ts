import { Hono } from "hono";
import type { AppEnv } from "./util";
import { addDays } from "./util";
import { requireTherapist } from "./auth";

/**
 * Coach overview: for every active client, a day-by-day strip (two weeks back, one week ahead),
 * how many of their comments and messages are still waiting on a reply, and the next planned day.
 * The engagement and churn numbers come from /crm; the page joins the two by client id.
 */
export const overview = new Hono<AppEnv>();

overview.get("/overview", async (c) => {
  const user = requireTherapist(c);
  const t = new Date().toISOString().slice(0, 10);
  const from = addDays(t, -13);
  const to = addDays(t, 6);

  const [days, waiting, next] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT w.patient_id, w.scheduled_on, COUNT(*) AS planned, SUM(w.completed_at IS NOT NULL) AS done, MAX(w.pain_after) AS pain_after
       FROM workouts w JOIN users p ON p.id = w.patient_id
       WHERE w.therapist_id = ? AND p.stage = 'active' AND p.archived = 0 AND w.scheduled_on BETWEEN ? AND ?
       GROUP BY w.patient_id, w.scheduled_on`,
    ).bind(user.id, from, to),
    c.env.DB.prepare(
      `SELECT patient_id, COUNT(*) AS n, MAX(created_at) AS latest_at,
              (SELECT body FROM (
                 SELECT wc.body, wc.created_at, w2.patient_id AS pid FROM workout_comments wc JOIN workouts w2 ON w2.id = wc.workout_id
                 WHERE wc.author_id = w2.patient_id AND wc.handled_at IS NULL
                 UNION ALL SELECT m.body, m.created_at, m.patient_id FROM messages m WHERE m.sender_id = m.patient_id AND m.read_at IS NULL
               ) WHERE pid = x.patient_id ORDER BY created_at DESC LIMIT 1) AS latest
       FROM (
         SELECT w.patient_id, wc.created_at FROM workout_comments wc JOIN workouts w ON w.id = wc.workout_id
         WHERE w.therapist_id = ? AND wc.author_id = w.patient_id AND wc.handled_at IS NULL
         UNION ALL
         SELECT m.patient_id, m.created_at FROM messages m JOIN users p ON p.id = m.patient_id
         WHERE p.therapist_id = ? AND m.sender_id = p.id AND m.read_at IS NULL
       ) x GROUP BY patient_id`,
    ).bind(user.id, user.id),
    c.env.DB.prepare(
      `SELECT patient_id, MIN(scheduled_on) AS next_on, MAX(scheduled_on) AS last_on FROM workouts
       WHERE therapist_id = ? AND scheduled_on >= ? GROUP BY patient_id`,
    ).bind(user.id, t),
  ]);

  type Day = { date: string; planned: number; done: number; pain_after: number | null };
  const byClient = new Map<string, { days: Day[]; waiting: number; latest: string | null; latest_at: string | null; next_on: string | null; last_on: string | null }>();
  const get = (id: string) => {
    let v = byClient.get(id);
    if (!v) byClient.set(id, (v = { days: [], waiting: 0, latest: null, latest_at: null, next_on: null, last_on: null }));
    return v;
  };
  for (const r of days.results as (Day & { patient_id: string; scheduled_on: string })[])
    get(r.patient_id).days.push({ date: r.scheduled_on, planned: r.planned, done: r.done, pain_after: r.pain_after });
  for (const r of waiting.results as { patient_id: string; n: number; latest: string | null; latest_at: string | null }[])
    Object.assign(get(r.patient_id), { waiting: r.n, latest: r.latest, latest_at: r.latest_at });
  for (const r of next.results as { patient_id: string; next_on: string; last_on: string }[])
    Object.assign(get(r.patient_id), { next_on: r.next_on, last_on: r.last_on });

  return c.json({ today: t, from, to, clients: Object.fromEntries(byClient) });
});
