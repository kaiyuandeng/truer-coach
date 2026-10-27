import { useState, type ReactNode } from "react";
import { api } from "../../api";
import { addDays, dayLabel, startOfWeek, ymd } from "../../dates";
import { Icon } from "../../components/Icon";
import { Sheet, toast } from "../../components/ui";
import { Video } from "../../components/Video";
import { confetti } from "../../components/confetti";

// ---------- Types shared with worker/store.ts ----------

export type Course = {
  id: string;
  therapist_id: string;
  program_id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  highlights: string | null;
  level: string;
  price_cents: number;
  cover: string;
  published: number;
  coach_name: string;
  program_name: string;
  weeks: number;
  days_per_week: number;
  workout_count: number;
  exercise_count: number;
  sales: number;
  revenue_cents: number;
  purchase_id?: string | null;
  updated_at: string;
};

export type CourseExercise = {
  exercise_id: string;
  name: string;
  body_area: string | null;
  description: string | null;
  video_url: string | null;
  has_video: number;
  block?: string;
  instructions?: string | null;
};

export type CourseDetail = Course & {
  days: { week: number; day: number; title: string; items: CourseExercise[] }[];
  exercises: CourseExercise[];
  body_areas: string[];
  purchase_id: string | null;
};

export type Purchase = {
  id: string;
  price_cents: number;
  created_at: string;
  started_on: string | null;
  course_id: string;
  title: string;
  tagline: string | null;
  cover: string;
  level: string;
  therapist_id: string;
  weeks: number;
  days_per_week: number;
  coach_name: string;
  total: number;
  done: number;
  ends_on: string | null;
  next_workout_id: string | null;
  next_on: string | null;
  workouts?: { id: string; title: string; scheduled_on: string; completed_at: string | null }[];
};

export const COVERS = ["violet", "teal", "sunset", "ocean", "forest", "slate"];
export const LEVELS = ["All levels", "Beginner", "Intermediate", "Advanced"];

export const money = (cents: number) =>
  cents === 0 ? "Free" : (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });

export const storeUrl = (coachId: string, courseId?: string) => `${location.origin}/store/${coachId}${courseId ? `/${courseId}` : ""}`;

// ---------- Pieces ----------

export function Cover({ course, size = "md", children }: { course: Pick<Course, "cover" | "title" | "level"> & { weeks?: number }; size?: "sm" | "md" | "lg"; children?: ReactNode }) {
  return (
    <div className={`course-cover cover-${course.cover} ${size}`}>
      {size !== "sm" && (
        <>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="cover-chip">{course.level}</span>
            {course.weeks ? <span className="cover-chip">{course.weeks} weeks</span> : null}
          </div>
          {size === "lg" ? <h1 className="cover-title">{course.title}</h1> : <div className="cover-title">{course.title}</div>}
        </>
      )}
      {children}
    </div>
  );
}

export function CourseCard({ course, onClick, footer }: { course: Course; onClick: () => void; footer?: ReactNode }) {
  return (
    <button className="card course-card" onClick={onClick}>
      <Cover course={course} />
      <div className="course-card-body">
        {course.tagline && <div className="small muted">{course.tagline}</div>}
        <div className="row tiny faint" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <span>{course.workout_count} workouts</span>
          <span>{course.days_per_week}× a week</span>
          <span>{course.exercise_count} exercises</span>
        </div>
        <div className="row between" style={{ marginTop: 12 }}>
          {footer ?? (course.purchase_id ? <span className="chip accent"><Icon name="check" size={14} /> Owned</span> : <span className="price">{money(course.price_cents)}</span>)}
          <Icon name="chev" size={18} />
        </div>
      </div>
    </button>
  );
}

/** Product page for a course: what it is, what's in it, and a buy button. Used by the client app and the public store. */
export function CourseDetailView({ course, cta, preview }: { course: CourseDetail; cta: ReactNode; preview?: boolean }) {
  const [openWeek, setOpenWeek] = useState(1);
  const owned = !!course.purchase_id;
  const firstVideo = course.days[0]?.items.find((i) => i.has_video && i.video_url);
  const highlights = (course.highlights ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const weeks = Array.from({ length: course.weeks }, (_, i) => i + 1);
  const videoCount = course.exercises.filter((e) => e.has_video).length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Cover course={course} size="lg" />
      <div>
        {course.tagline && <div style={{ fontSize: 18, fontWeight: 600 }}>{course.tagline}</div>}
        <div className="small faint" style={{ marginTop: 6 }}>By {course.coach_name}{course.sales > 2 ? ` · ${course.sales} people enrolled` : ""}</div>
      </div>

      <div className="card pad buy-box">
        <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="price lg">{owned ? "You own this" : money(course.price_cents)}</div>
            {!owned && course.price_cents > 0 && <div className="tiny faint">One-time purchase · Lifetime access</div>}
          </div>
          <div className="buy-cta">{cta}</div>
        </div>
        {preview && <div className="tiny faint" style={{ marginTop: 8 }}>{course.published ? "This is what buyers see." : "Draft: only you can see this page."}</div>}
      </div>

      <div className="course-stats">
        <div><b>{course.weeks}</b><span>weeks</span></div>
        <div><b>{course.workout_count}</b><span>workouts</span></div>
        <div><b>{course.exercise_count}</b><span>exercises</span></div>
        <div><b>{videoCount}</b><span>video demos</span></div>
      </div>

      {course.description && (
        <div>
          <div className="section-title" style={{ marginTop: 4 }}>About this course</div>
          <div className="pre" style={{ lineHeight: 1.55 }}>{course.description}</div>
        </div>
      )}

      {highlights.length > 0 && (
        <div className="card pad stack" style={{ gap: 10 }}>
          {highlights.map((h) => (
            <div key={h} className="row" style={{ alignItems: "flex-start" }}>
              <span className="tick"><Icon name="check" size={14} /></span>
              <span className="small">{h}</span>
            </div>
          ))}
        </div>
      )}

      {firstVideo && (
        <div>
          <div className="section-title" style={{ marginTop: 4 }}>Free preview</div>
          <Video videoKey={null} videoUrl={firstVideo.video_url} title={firstVideo.name} />
          <div className="small muted" style={{ marginTop: 6 }}>{firstVideo.name}{firstVideo.description ? `: ${firstVideo.description}` : ""}</div>
        </div>
      )}

      <div>
        <div className="section-title" style={{ marginTop: 4 }}>What's inside</div>
        <div className="list">
          {weeks.map((w) => {
            const days = course.days.filter((d) => d.week === w);
            const locked = !owned && !preview && w > 1;
            const open = openWeek === w;
            return (
              <div key={w}>
                <button className="list-item" onClick={() => setOpenWeek(open ? 0 : w)} aria-expanded={open}>
                  <span className="block-tag">{w}</span>
                  <div className="grow">
                    <div style={{ fontWeight: 650 }}>Week {w}</div>
                    <div className="tiny faint ellipsis">{days.length ? days.map((d) => d.title).join(" · ") : "Rest week"}</div>
                  </div>
                  {locked ? <Icon name="lock" size={18} /> : <span className="chev" style={{ transform: open ? "rotate(90deg)" : undefined, display: "grid" }}><Icon name="chev" size={18} /></span>}
                </button>
                {open && (
                  <div className="week-body">
                    {days.map((d) => (
                      <div key={d.day} className="day-block">
                        <div className="small" style={{ fontWeight: 650 }}>Day {d.day}: {d.title}</div>
                        {locked ? (
                          <div className="tiny faint" style={{ marginTop: 4 }}>{d.items.length} exercises · unlocks when you buy</div>
                        ) : (
                          <div className="tiny muted" style={{ marginTop: 4 }}>
                            {d.items.map((i, n) => (
                              <span key={n}>{n ? " · " : ""}{i.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {course.body_areas.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {course.body_areas.map((a) => <span key={a} className="chip">{a}</span>)}
        </div>
      )}
    </div>
  );
}

/**
 * Simulated checkout. Nothing is charged: the card is only checked for shape, and 4000 0000 0000 0002
 * declines like Stripe's test card. Guests also create their account here.
 */
export function CheckoutSheet({ course, guest, onClose, onPaid }: { course: Course; guest?: boolean; onClose: () => void; onPaid: (purchaseId: string) => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", card: "4242 4242 4242 4242", exp: "12 / 34", cvc: "123" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const free = course.price_cents === 0;
  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ purchaseId: string; already?: boolean }>(`/store/${course.therapist_id}/courses/${course.id}/checkout`, {
        ...(guest ? { name: form.name, email: form.email, password: form.password } : {}),
        card: form.card,
      });
      if (!r.already) confetti();
      onPaid(r.purchaseId);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <form className="stack" onSubmit={pay}>
        <h2>Checkout</h2>
        <div className="row card pad" style={{ boxShadow: "none", background: "var(--surface)" }}>
          <Cover course={course} size="sm" />
          <div className="grow">
            <div style={{ fontWeight: 650 }}>{course.title}</div>
            <div className="tiny faint">{course.weeks} weeks · {course.workout_count} workouts · by {course.coach_name}</div>
          </div>
          <div className="price">{money(course.price_cents)}</div>
        </div>
        {guest && (
          <>
            <div className="section-title" style={{ margin: "4px 4px 0" }}>Your account</div>
            <label className="field"><span>Name</span><input className="input" autoComplete="name" value={form.name} onChange={set("name")} required /></label>
            <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" value={form.email} onChange={set("email")} required /></label>
            <label className="field"><span>Password</span><input className="input" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} required /></label>
          </>
        )}
        {!free && (
          <>
            <div className="section-title" style={{ margin: "4px 4px 0" }}>Payment</div>
            <div className="demo-note"><Icon name="alert" size={16} /> Demo checkout. No card is charged; use 4000 0000 0000 0002 to see a decline.</div>
            <label className="field"><span>Card number</span><input className="input" inputMode="numeric" autoComplete="cc-number" value={form.card} onChange={set("card")} required /></label>
            <div className="row">
              <label className="field grow"><span>Expiry</span><input className="input" autoComplete="cc-exp" value={form.exp} onChange={set("exp")} required /></label>
              <label className="field grow"><span>CVC</span><input className="input" inputMode="numeric" autoComplete="cc-csc" value={form.cvc} onChange={set("cvc")} required /></label>
            </div>
          </>
        )}
        {error && <div className="error">{error}</div>}
        <button className="btn primary block lg" disabled={busy}>
          <Icon name="lock" size={18} /> {busy ? "Processing…" : free ? "Enroll for free" : `Pay ${money(course.price_cents)}`}
        </button>
      </form>
    </Sheet>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW = [1, 2, 3, 4, 5, 6, 0]; // JS getDay values in Monday-first order

/** Lets a buyer pick when to start a course and which days they train, then puts it on their calendar. */
export function ScheduleForm({ purchase, onDone }: { purchase: Pick<Purchase, "id" | "days_per_week" | "weeks" | "title">; onDone: () => void }) {
  const today = ymd();
  const nextMonday = addDays(startOfWeek(today), 7);
  const [start, setStart] = useState(today);
  const [days, setDays] = useState<number[]>(() => [1, 3, 5, 2, 4, 6, 0].slice(0, purchase.days_per_week).sort((a, b) => DOW.indexOf(a) - DOW.indexOf(b)));
  const [busy, setBusy] = useState(false);
  const toggle = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => DOW.indexOf(a) - DOW.indexOf(b))));
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ created: number }>(`/purchases/${purchase.id}/schedule`, { startDate: start, weekdays: days });
      toast(`Added ${r.created} workouts to your calendar`);
      onDone();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <div className="field">
        <span>Start</span>
        <div className="segmented">
          <button type="button" className={start === today ? "on" : ""} onClick={() => setStart(today)}>Today</button>
          <button type="button" className={start === nextMonday ? "on" : ""} onClick={() => setStart(nextMonday)}>Next Monday</button>
        </div>
        <input className="input" type="date" min={today} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
      </div>
      <div className="field">
        <span>Training days ({days.length} of {purchase.days_per_week})</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {DOW.map((d, i) => (
            <button type="button" key={d} className={`btn sm${days.includes(d) ? " primary" : ""}`} onClick={() => toggle(d)}>{WEEKDAYS[i]}</button>
          ))}
        </div>
      </div>
      <div className="small muted">
        {purchase.weeks} weeks. Day 1 is your first training day from {dayLabel(start, { long: true }).replace(/^(Today|Tomorrow)$/, (m) => m.toLowerCase())} on.
      </div>
      <button className="btn primary block lg" disabled={busy || days.length !== purchase.days_per_week} onClick={save}>
        <Icon name="calendar" size={18} /> Add to my calendar
      </button>
    </div>
  );
}
