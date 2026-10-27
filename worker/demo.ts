/**
 * Demo data: a coach ("Evan") with a full workout CRM and several patients, including "Kai", whose
 * history mirrors a real TrueCoach account (phases, weeks, A1/A2 supersets, mobility days).
 * Everything is written as literal SQL in a few multi-row statements so it runs in one D1 exec.
 */
import { addDays } from "./util";

export const DEMO_COACH_ID = "demo-coach";
export const DEMO_PATIENT_ID = "demo-kai";

type Row = (string | number | null)[];

const q = (v: string | number | null) =>
  v === null ? "NULL" : typeof v === "number" ? String(v) : "'" + v.replace(/'/g, "''").replace(/\n/g, "\\n") + "'";

function inserts(table: string, cols: string[], rows: Row[], chunk = 60): string[] {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows.slice(i, i + chunk).map((r) => "(" + r.map(q).join(",") + ")").join(",");
    out.push(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${values};`);
  }
  return out;
}

// Deterministic pseudo-random so the demo looks the same each reset.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const ytSearch = (name: string) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(name + " exercise");

// [id suffix, name, body area, category, description, default instructions]
const EXERCISES: [string, string, string, string, string, string][] = [
  ["glutes-roller", "Glutes w Foam Roller", "Hip", "Soft tissue", "Sit on the roller, cross one ankle over the other knee and lean into that glute. Roll slowly and pause on tender spots.", "x :30 seconds each"],
  ["calves-roller", "Calves w Foam Roller", "Ankle", "Soft tissue", "Roller under one calf, other leg crossed on top for pressure. Roll from ankle to just below the knee, turning the foot in and out.", "x :30 seconds each"],
  ["tspine-roller", "Thoracic Extension w Foam Roller", "Upper back", "Mobility", "Roller across the mid back, hands supporting the head. Extend back over the roller, then move it up one segment at a time.", "x 10 reps"],
  ["quads-roller", "Quads w Foam Roller", "Knee", "Soft tissue", "Face down with the roller under the thighs. Roll from hip to just above the knee; bend the knee on tender spots.", "x :30 seconds each"],
  ["9090", "90/90-Stretch", "Hip", "Mobility", "Sit with both knees bent to 90 degrees, one in front and one to the side. Tall spine, hinge forward over the front shin.", "x :30 seconds each"],
  ["spiderman", "Spiderman", "Hip", "Mobility", "From a push-up position step one foot outside the hand, drop the hips and reach the same-side arm to the ceiling.", "x 5 each side"],
  ["adductor-rock", "Adductor-Rock", "Hip", "Mobility", "On hands and knees with one leg out to the side, rock the hips back toward the heel and return.", "x 10 each side"],
  ["quad-tspine", "Quadruped T Spine Rotation", "Upper back", "Mobility", "On hands and knees with one hand behind the head. Rotate the elbow down toward the opposite wrist, then up to the ceiling.", "x 8 each side"],
  ["dynamic-chop", "Dynamic Chop", "Core", "Stability", "Half kneeling with a cable or band high and to the side. Pull across and down the body while keeping the hips square.", "2x10 each side"],
  ["goblet-squat", "Goblet - Squat", "Knee", "Strength", "Hold a kettlebell at the chest. Sit between the heels with knees tracking over toes, then drive up through the whole foot.", "3x10"],
  ["chin-up", "Chin Up", "Shoulder", "Strength", "Underhand grip, shoulder width. Pull the chest toward the bar without shrugging, lower with control.", "3x5"],
  ["plank-row", "Plank-Row", "Core", "Strength", "Plank on dumbbells, feet wide. Row one bell to the hip without rotating the hips, alternate sides.", "3x8 each side"],
  ["one-leg-dl", "One Leg Deadlift", "Hip", "Strength", "Stand on one leg with a soft knee. Hinge at the hip as the back leg reaches behind you, keeping hips level.", "2x12"],
  ["pf-lacrosse", "Plantar Fascia w Lacrosse Ball", "Foot", "Soft tissue", "Seated or standing, roll the arch of the foot over a lacrosse ball from heel to toes. Pause on tender spots.", "x 1:00 each foot"],
  ["ankle-distraction", "Ankle Distraction", "Ankle", "Mobility", "Band looped low around the front of the ankle, anchored behind you. Lunge the knee forward over the toes against the band.", "x 10 each side"],
  ["half-kneel-ankle", "1/2 Kneeling Ankle Mobility Drill", "Ankle", "Mobility", "Half kneeling, front heel flat. Drive the knee forward past the toes and hold, then return.", "x 10 each side"],
  ["hand-foot-glove", "Hand-Foot Glove", "Foot", "Mobility", "Interlace your fingers between your toes and gently spread and circle the forefoot.", "x :30 seconds each"],
  ["toe-breakers", "Toe Breakers", "Foot", "Mobility", "Kneel with toes tucked under and sit back toward the heels until you feel a stretch in the toes and arch.", "x :30 seconds"],
  ["towel-scrunch", "Towel Scrunches", "Foot", "Strength", "Seated with a towel under the foot, curl the toes to pull the towel toward you without lifting the heel.", "2x15 each foot"],
  ["calf-wall", "Calf Stretch at Wall", "Ankle", "Stretching", "Hands on the wall, one leg back with the heel down and knee straight. Lean in until you feel the calf.", "x :30 seconds each"],
  ["ankle-df", "Ankle DF Progression", "Ankle", "Strength", "Band around the top of the foot. Pull the toes toward the shin against the band, lower slowly.", "2x15 each side"],
  ["ankle-pf", "Ankle PF Progression", "Ankle", "Strength", "Single-leg calf raise from a step edge, full range, 3 seconds down.", "2x12 each side"],
  ["double-wrist-curl", "Double Wrist Curl", "Wrist", "Strength", "Forearms on thighs, light dumbbells palm up. Curl the wrists up, lower slowly.", "2x15"],
  ["floor-wrist-curl", "Floor Wrist Curl", "Wrist", "Mobility", "On hands and knees with fingers pointing back toward the knees, gently shift weight back to stretch the forearms.", "x :30 seconds"],
  ["wall-hip-flexor", "Wall Hip Flexor Stretch", "Hip", "Stretching", "Back knee near the wall with the shin up the wall, front foot forward. Squeeze the glute and stay tall.", "x :45 seconds each"],
  ["wall-quad", "Wall Quad Stretch", "Knee", "Stretching", "Kneel facing away from a wall with the back shin up the wall. Bring the torso upright as tolerated.", "x :45 seconds each"],
  ["bwd-step-up", "BWD Step Up", "Knee", "Strength", "Stand on a low step facing away from it. Reach one foot back and down to tap the floor, then drive back up.", "2x10 each side"],
  ["rom-split-squat", "ROM Split Squat", "Knee", "Strength", "Split stance with the front foot on a low plate. Lower the back knee toward the floor through a full, pain-free range.", "2x8 each side"],
];

const ex = (suffix: string) => "demo-ex-" + suffix;

// Templates: [id, name, folder, tags, notes, items: [exercise suffix, block, instructions?]]
const TEMPLATES: [string, string, string, string, string | null, [string, string, string?][]][] = [
  ["tpl-strength-a", "Strength A", "Phase 14", "strength,full body", "Move well first, then load. Keep RPE around 7.", [
    ["glutes-roller", "A"], ["calves-roller", "A"], ["tspine-roller", "A"], ["quads-roller", "A"],
    ["9090", "B"], ["spiderman", "B"], ["adductor-rock", "B"], ["quad-tspine", "B"],
    ["dynamic-chop", "C"], ["goblet-squat", "D", "3x10 @ 35 lb"], ["chin-up", "E"], ["plank-row", "F"], ["one-leg-dl", "G"],
  ]],
  ["tpl-strength-b", "Strength B", "Phase 14", "strength,knee", null, [
    ["glutes-roller", "A"], ["quads-roller", "A"],
    ["wall-hip-flexor", "B"], ["wall-quad", "B"], ["ankle-distraction", "B"],
    ["bwd-step-up", "C"], ["rom-split-squat", "C"], ["one-leg-dl", "D", "2x10 @ 20 lb"], ["plank-row", "E"],
  ]],
  ["tpl-pf-ankle-wrist", "PF+Ankle+Wrists", "Mobility days", "plantar fascia,ankle,wrist", "Daily maintenance. Should take about 20 minutes.", [
    ["calves-roller", "A"], ["pf-lacrosse", "A"],
    ["ankle-distraction", "B"], ["half-kneel-ankle", "B"], ["hand-foot-glove", "B"], ["toe-breakers", "B"], ["towel-scrunch", "B"], ["calf-wall", "B"],
    ["ankle-df", "C"], ["ankle-pf", "C"], ["double-wrist-curl", "D"], ["floor-wrist-curl", "D"],
  ]],
  ["tpl-pf-knee", "PF + Knee", "Mobility days", "plantar fascia,knee", null, [
    ["quads-roller", "A"], ["pf-lacrosse", "A"],
    ["wall-hip-flexor", "B"], ["wall-quad", "B"], ["ankle-distraction", "B"], ["half-kneel-ankle", "B"], ["hand-foot-glove", "B"], ["toe-breakers", "B"], ["towel-scrunch", "B"], ["calf-wall", "B"],
    ["bwd-step-up", "C"], ["rom-split-squat", "C"],
  ]],
  ["tpl-strength-a13", "Strength A", "Phase 13", "strength", null, [
    ["glutes-roller", "A"], ["tspine-roller", "A"], ["9090", "B"], ["spiderman", "B"],
    ["goblet-squat", "C", "3x10 @ 25 lb"], ["chin-up", "D", "3x3"], ["one-leg-dl", "E", "2x10"],
  ]],
  ["tpl-strength-b13", "Strength B", "Phase 13", "strength", null, [
    ["quads-roller", "A"], ["wall-quad", "B"], ["ankle-distraction", "B"], ["bwd-step-up", "C", "2x8 each side"], ["plank-row", "D", "3x6 each side"],
  ]],
  ["tpl-acl-early", "ACL early rehab", "Knee", "knee,post-op", "Weeks 2-6 post-op. Stop if swelling increases.", [
    ["quads-roller", "A"], ["wall-quad", "B"], ["ankle-df", "C", "2x15"], ["bwd-step-up", "D", "2x8 each side, 4 inch step"],
  ]],
  ["tpl-desk-reset", "Desk worker reset", "Upper body", "posture,neck,upper back", null, [
    ["tspine-roller", "A"], ["quad-tspine", "A"], ["floor-wrist-curl", "B"], ["double-wrist-curl", "B"], ["9090", "C"],
  ]],
];

// Programs: [id, name, description, weeks, days per week, template per day]
const PROGRAMS: [string, string, string, number, number, string[]][] = [
  ["prog-phase-13", "Phase 13", "Base strength with daily foot and ankle work.", 4, 2, ["tpl-strength-a13", "tpl-strength-b13"]],
  ["prog-phase-14", "Phase 14", "Load progression: goblet squat to 35 lb, single-leg work, more trunk.", 4, 2, ["tpl-strength-a", "tpl-strength-b"]],
];

const OTHER_PATIENTS: [string, string, string, number, number][] = [
  // id, name, diagnosis, adherence 0..1, pain trend start->end encoded as start*10+end
  ["demo-maya", "Maya Rodriguez", "ACL reconstruction, 9 weeks post-op", 0.92, 52],
  ["demo-jordan", "Jordan Lee", "Low back pain, desk worker", 0.45, 36],
  ["demo-priya", "Priya Shah", "Rotator cuff tendinopathy", 0.8, 43],
  ["demo-sam", "Sam Whitaker", "Ankle sprain, return to running", 0.7, 31],
];

export function demoSql(today: string): string[] {
  const rand = rng(14);
  const sql: string[] = [];

  sql.push(
    ...inserts("users", ["id", "role", "name", "email", "therapist_id", "diagnosis", "goals", "notes", "stage", "stage_changed_at", "source", "monthly_rate", "follow_up_on", "created_at"], [
      [DEMO_COACH_ID, "therapist", "Evan", "coach@demo.rehabloop", null, null, null, null, "active", today, null, null, null, addDays(today, -400)],
      [DEMO_PATIENT_ID, "patient", "Kai", "kai@demo.rehabloop", DEMO_COACH_ID, "Plantar fasciitis, ankle mobility, general strength",
        "Run a pain-free 10k. Squat and hike without foot pain the next morning.",
        "Responds well to load. Flare-ups usually after long days standing.", "active", addDays(today, -300), "Referral", 400, null, addDays(today, -310)],
      ...OTHER_PATIENTS.map(([pid, name, dx], i) =>
        [pid, "patient", name, `${pid.slice(5)}@demo.rehabloop`, DEMO_COACH_ID, dx, null, null, "active", addDays(today, -40 - i * 23), ["Google", "Referral", "Instagram", "Gym partnership"][i], [450, 300, 350, 300][i], pid === "demo-jordan" ? today : null, addDays(today, -45 - i * 23)] as Row),
      // Pipeline: people who aren't (or are no longer) training.
      ["demo-alex", "patient", "Alex Chen", null, DEMO_COACH_ID, "Runner's knee, wants a 12-week plan", null, "Filled out the website form. Prefers evenings.", "lead", addDays(today, -2), "Website", 400, today, addDays(today, -2)],
      ["demo-nina", "patient", "Nina Okafor", null, DEMO_COACH_ID, "Postpartum core and pelvic floor", null, "Asked about pricing on Instagram.", "lead", addDays(today, -6), "Instagram", 350, addDays(today, 1), addDays(today, -6)],
      ["demo-taylor", "patient", "Taylor Brooks", null, DEMO_COACH_ID, "Chronic neck pain, office worker", null, "Free consult booked for Thursday.", "consult", addDays(today, -4), "Referral: Dr. Patel", 350, addDays(today, 2), addDays(today, -9)],
      ["demo-morgan", "patient", "Morgan Diaz", "morgan@demo.rehabloop", DEMO_COACH_ID, "Hip impingement", null, "Travelling until December. Check in on the 1st.", "paused", addDays(today, -20), "Google", 400, addDays(today, 12), addDays(today, -160)],
      ["demo-chris", "patient", "Chris Novak", "chris@demo.rehabloop", DEMO_COACH_ID, "Tennis elbow (resolved)", null, "Finished treatment, happy. Ask for a testimonial.", "churned", addDays(today, -35), "Google", 300, null, addDays(today, -200)],
    ]),
  );

  sql.push(
    ...inserts("exercises", ["id", "therapist_id", "name", "body_area", "category", "description", "video_url", "default_instructions"],
      EXERCISES.map(([s, name, area, cat, desc, dose]) => [ex(s), DEMO_COACH_ID, name, area, cat, desc, ytSearch(name), dose])),
  );

  const templateRows: Row[] = [];
  const templateItems: Row[] = [];
  TEMPLATES.forEach(([tid, name, folder, tags, notes, items], ti) => {
    templateRows.push([tid, DEMO_COACH_ID, name, notes, folder, tags, addDays(today, -120 + ti * 9) + " 12:00:00"]);
    items.forEach(([s, block, instr], i) => {
      const dose = instr ?? EXERCISES.find((e) => e[0] === s)![5];
      templateItems.push([`${tid}-i${i}`, tid, ex(s), i, block, dose]);
    });
  });
  sql.push(...inserts("templates", ["id", "therapist_id", "name", "notes", "folder", "tags", "updated_at"], templateRows));
  sql.push(...inserts("template_items", ["id", "template_id", "exercise_id", "position", "block", "instructions"], templateItems));

  const programRows: Row[] = [];
  const programDays: Row[] = [];
  for (const [pid, name, desc, weeks, dpw, tpls] of PROGRAMS) {
    programRows.push([pid, DEMO_COACH_ID, name, desc, weeks, dpw]);
    for (let w = 1; w <= weeks; w++) for (let d = 1; d <= dpw; d++) programDays.push([pid, w, d, tpls[d - 1]]);
  }
  sql.push(...inserts("programs", ["id", "therapist_id", "name", "description", "weeks", "days_per_week"], programRows));
  sql.push(...inserts("program_days", ["program_id", "week", "day", "template_id"], programDays));

  // ---- Kai's calendar: strength on Tue/Fri from the current phase, mobility the other days. ----
  const workouts: Row[] = [];
  const items: Row[] = [];
  const comments: Row[] = [];
  const tplById = new Map(TEMPLATES.map((t) => [t[0], t]));

  const addWorkout = (
    patientId: string,
    date: string,
    title: string,
    tplId: string,
    programId: string | null,
    opts: { completed: boolean; pain: number | null; notes?: string | null; doneAll?: boolean },
  ) => {
    const wid = `w-${patientId}-${date}`;
    const tpl = tplById.get(tplId)!;
    const completedAt = opts.completed ? `${date}T${String(17 + Math.floor(rand() * 4)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}:00.000Z` : null;
    workouts.push([wid, patientId, DEMO_COACH_ID, date, title, opts.notes ?? null, completedAt, opts.pain === null ? null : Math.min(10, opts.pain + 1), opts.pain, tplId, programId]);
    tpl[5].forEach(([s, block, instr], i) => {
      const dose = instr ?? EXERCISES.find((e) => e[0] === s)![5];
      const done = opts.completed && (opts.doneAll || rand() > 0.06) ? 1 : 0;
      const result = done && rand() > 0.82 ? ["Felt good", "Left side tighter", "Easier than last week", "Went up 5 lb", "Some arch pain at the end"][Math.floor(rand() * 5)] : null;
      items.push([`${wid}-i${i}`, wid, ex(s), i, block, dose, result, done]);
    });
    return wid;
  };

  // 70 days back through 14 days ahead.
  for (let off = -70; off <= 14; off++) {
    const date = addDays(today, off);
    const dow = new Date(date + "T00:00:00Z").getUTCDay(); // 0 Sun
    if (dow === 0) continue; // Sundays off
    const past = off < 0;
    const progress = (off + 70) / 70; // 0 -> 1 across history
    const pain = past ? Math.max(0, Math.round(5 - progress * 3.4 + (rand() - 0.5) * 2)) : null;
    const completed = past && rand() < 0.9;
    // Phase 13 for the first four weeks shown, then Phase 14 (today is Phase 14 Week 4 Day 1).
    const isStrength = dow === 2 || dow === 5;
    if (isStrength) {
      const phase14Start = addDays(today, -21 - ((new Date(today + "T00:00:00Z").getUTCDay() + 5) % 7));
      const inPhase14 = date >= phase14Start;
      const phaseStart = inPhase14 ? phase14Start : addDays(phase14Start, -28);
      const week = Math.floor((Date.parse(date) - Date.parse(phaseStart)) / (7 * 86400_000)) + 1;
      const day = dow === 2 ? 1 : 2;
      const prog = inPhase14 ? PROGRAMS[1] : PROGRAMS[0];
      if (week < 1 || week > 4) continue; // next phase is left for the coach to build on the board
      const wid = addWorkout(DEMO_PATIENT_ID, date, `${prog[1]} Week ${week} Day ${day}`, prog[5][day - 1], prog[0], {
        completed,
        pain,
        notes: off === 0 ? "Kai - small changes this week: goblet squat up to 35 lb, and one leg deadlift is back. Film a set of the deadlift for me if you can." : null,
      });
      if (completed && rand() > 0.6)
        comments.push([`${wid}-c1`, wid, DEMO_PATIENT_ID, ["Squats felt strong today.", "Foot was a little sore after the deadlifts.", "Chin ups are getting easier!", "Short on time, did everything but the chops."][Math.floor(rand() * 4)], `${date} 19:30:00`, `${date} 21:05:00`]);
      if (completed)
        comments.push([`${wid}-c2`, wid, DEMO_COACH_ID, ["Great work. Keep the tempo slow on the way down.", "Nice! Let's add 5 lb next week if it stays this smooth.", "Good call backing off. Ice the arch tonight and let me know tomorrow.", "Looking strong. How did the foot feel this morning?"][Math.floor(rand() * 4)], `${date} 21:05:00`, null]);
    } else {
      const tpl = dow % 2 === 1 ? "tpl-pf-ankle-wrist" : "tpl-pf-knee";
      addWorkout(DEMO_PATIENT_ID, date, tplById.get(tpl)![1], tpl, null, { completed: completed && rand() < 0.95, pain, doneAll: true });
    }
  }

  // Other patients: a few weeks of workouts each, with different adherence and pain trends.
  OTHER_PATIENTS.forEach(([pid, , , adherence, painCode]) => {
    const p0 = Math.floor(painCode / 10);
    const p1 = painCode % 10;
    const tpl = pid === "demo-maya" ? "tpl-acl-early" : pid === "demo-jordan" ? "tpl-desk-reset" : pid === "demo-priya" ? "tpl-desk-reset" : "tpl-pf-knee";
    for (let off = -35; off <= (pid === "demo-jordan" ? -2 : 10); off += 2) {
      const date = addDays(today, off);
      const past = off < 0;
      const t = (off + 35) / 35;
      const pain = past ? Math.max(0, Math.round(p0 + (p1 - p0) * t + (rand() - 0.5) * 1.5)) : null;
      addWorkout(pid, date, tplById.get(tpl)![1], tpl, null, { completed: past && rand() < adherence, pain });
    }
  });

  sql.push(
    ...inserts("workouts", ["id", "patient_id", "therapist_id", "scheduled_on", "title", "notes", "completed_at", "pain_before", "pain_after", "template_id", "program_id"], workouts),
    ...inserts("workout_items", ["id", "workout_id", "exercise_id", "position", "block", "instructions", "result", "done"], items),
  );
  // Fresh comments from the last couple of days, still waiting on a reply in the coach inbox.
  const recent: [string, string, string][] = [
    [DEMO_PATIENT_ID, addDays(today, -1), "Arch was sore after yesterday's step ups, maybe a 3/10. Rolled it out and it calmed down."],
    ["demo-maya", addDays(today, -1), "Step ups felt way more stable today. Swelling basically gone."],
    ["demo-priya", addDays(today, -2), "Shoulder clicked a couple times during the rows but no pain."],
  ];
  for (const [pid, date, text] of recent) {
    const w = workouts.filter((r) => r[1] === pid && (r[3] as string) <= date && r[6]).pop();
    const target = w ?? workouts.filter((r) => r[1] === pid && (r[3] as string) < today).pop();
    if (target) comments.push([`${target[0]}-recent`, target[0] as string, pid, text, `${date} 19:45:00`, null]);
  }
  if (comments.length) sql.push(...inserts("workout_comments", ["id", "workout_id", "author_id", "body", "created_at", "handled_at"], comments));

  // ---- Messages ----
  const msgs: [string, string, string, number][] = [
    [DEMO_PATIENT_ID, DEMO_PATIENT_ID, "Foot felt a lot better this week. Hiked 6 miles on Saturday with no pain the next morning!", -9],
    [DEMO_PATIENT_ID, DEMO_COACH_ID, "That's huge. Exactly what we've been working toward. Keep the lacrosse ball work daily even on good days.", -9],
    [DEMO_PATIENT_ID, DEMO_PATIENT_ID, "Should I keep doing the wrist curls? Wrist hasn't bothered me in weeks.", -3],
    [DEMO_PATIENT_ID, DEMO_COACH_ID, "Kai - a few small changes to your program heading into week 4. Goblet squat goes to 35 lb, and the wrist work drops to every other day. Shout if anything flares up.", -1],
    ["demo-jordan", "demo-jordan", "Sorry I've been missing sessions, work has been crazy. Back still stiff in the mornings.", -2],
    ["demo-maya", "demo-maya", "Knee swelling is way down! Can I start jogging?", 0],
  ];
  sql.push(
    ...inserts("messages", ["id", "patient_id", "sender_id", "body", "created_at", "read_at"],
      msgs.map(([pid, sender, body, off], i) => [`demo-msg-${i}`, pid, sender, body, `${addDays(today, off)} ${String(9 + i).padStart(2, "0")}:15:00`, sender === DEMO_COACH_ID || off < -1 ? `${addDays(today, off)} 22:00:00` : null])),
  );

  return sql;
}

/** Deletes every row owned by the demo coach and their patients. */
export function demoWipeSql(): string[] {
  const patients = `(SELECT id FROM users WHERE therapist_id = '${DEMO_COACH_ID}')`;
  const people = `(SELECT id FROM users WHERE id = '${DEMO_COACH_ID}' OR therapist_id = '${DEMO_COACH_ID}')`;
  return [
    `DELETE FROM sessions WHERE user_id IN ${people};`,
    `DELETE FROM workout_comments WHERE workout_id IN (SELECT id FROM workouts WHERE therapist_id = '${DEMO_COACH_ID}');`,
    `DELETE FROM workout_items WHERE workout_id IN (SELECT id FROM workouts WHERE therapist_id = '${DEMO_COACH_ID}');`,
    `DELETE FROM workouts WHERE therapist_id = '${DEMO_COACH_ID}' OR patient_id IN ${patients};`,
    `DELETE FROM messages WHERE patient_id IN ${patients};`,
    `DELETE FROM program_days WHERE program_id IN (SELECT id FROM programs WHERE therapist_id = '${DEMO_COACH_ID}');`,
    `DELETE FROM programs WHERE therapist_id = '${DEMO_COACH_ID}';`,
    `DELETE FROM template_items WHERE template_id IN (SELECT id FROM templates WHERE therapist_id = '${DEMO_COACH_ID}');`,
    `DELETE FROM templates WHERE therapist_id = '${DEMO_COACH_ID}';`,
    `DELETE FROM exercises WHERE therapist_id = '${DEMO_COACH_ID}';`,
    `DELETE FROM users WHERE therapist_id = '${DEMO_COACH_ID}';`,
    `DELETE FROM users WHERE id = '${DEMO_COACH_ID}';`,
  ];
}
