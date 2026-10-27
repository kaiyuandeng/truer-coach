import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi, useOnFocus } from "../../hooks";
import { useSession } from "../../session";
import { dayLabel, ymd } from "../../dates";
import { Icon } from "../../components/Icon";
import { Empty, Spinner, TopBar } from "../../components/ui";
import { CheckoutSheet, Cover, CourseCard, CourseDetailView, ScheduleForm, type Course, type CourseDetail, type Purchase } from "../store/shared";

function PurchaseCard({ p }: { p: Purchase }) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <Link to={`/my-courses/${p.id}`} className="card owned-course" style={{ color: "inherit" }}>
      <Cover course={p} size="sm" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 650 }} className="ellipsis">{p.title}</div>
        {p.started_on ? (
          <>
            <div className="meter" style={{ marginTop: 8 }}><div style={{ width: `${pct}%`, background: "var(--accent)" }} /></div>
            <div className="tiny faint" style={{ marginTop: 4 }}>
              {p.done} of {p.total} workouts{p.next_on ? ` · next ${dayLabel(p.next_on).toLowerCase()}` : p.done === p.total ? " · complete" : ""}
            </div>
          </>
        ) : (
          <div className="small" style={{ color: "var(--brand)", fontWeight: 600, marginTop: 4 }}>Pick your start date</div>
        )}
      </div>
      <Icon name="chev" size={18} />
    </Link>
  );
}

/** The client's "Courses" tab: courses they own, then their coach's store. */
export function Shop() {
  const { me } = useSession();
  const nav = useNavigate();
  const purchases = useApi<Purchase[]>("/purchases");
  const store = useApi<{ coach: { name: string }; courses: Course[] }>(me.therapist_id ? `/store/${me.therapist_id}` : null);
  useOnFocus(purchases.reload);
  const forSale = (store.data?.courses ?? []).filter((c) => !c.purchase_id);

  return (
    <div className="page">
      <h1 style={{ marginBottom: 4 }}>Courses</h1>
      <div className="muted small" style={{ marginBottom: 8 }}>Self-guided programs{me.therapist_name ? ` from ${me.therapist_name}` : ""}.</div>

      {(purchases.loading && !purchases.data) || (store.loading && !store.data) ? (
        <Spinner />
      ) : (
        <>
          {!!purchases.data?.length && (
            <>
              <div className="section-title">My courses</div>
              <div className="stack">{purchases.data.map((p) => <PurchaseCard key={p.id} p={p} />)}</div>
            </>
          )}
          <div className="section-title">{purchases.data?.length ? "More courses" : "Available courses"}</div>
          {forSale.length ? (
            <div className="stack">
              {forSale.map((c) => <CourseCard key={c.id} course={c} onClick={() => nav(`/shop/${c.id}`)} />)}
            </div>
          ) : (
            <div className="card pad">
              <Empty icon="bag" title={purchases.data?.length ? "You have every course" : "No courses yet"}>
                {me.therapist_name ?? "Your coach"} hasn't put {purchases.data?.length ? "any other" : "any"} courses in the store yet.
              </Empty>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ShopCourse() {
  const { me } = useSession();
  const { courseId = "" } = useParams();
  const nav = useNavigate();
  const { data, error } = useApi<CourseDetail>(`/store/${me.therapist_id}/courses/${courseId}`);
  const [buying, setBuying] = useState(false);
  if (error) return <div className="page no-tabs"><TopBar back="/shop" /><div className="error">{error}</div></div>;
  if (!data) return <Spinner />;
  return (
    <>
      <TopBar back="/shop" title={data.title} />
      <div className="page no-tabs">
        <CourseDetailView
          course={data}
          cta={
            data.purchase_id ? (
              <button className="btn primary" onClick={() => nav(`/my-courses/${data.purchase_id}`)}>Go to course</button>
            ) : (
              <button className="btn primary" onClick={() => setBuying(true)}><Icon name="bag" size={18} /> Buy course</button>
            )
          }
        />
      </div>
      {buying && <CheckoutSheet course={data} onClose={() => setBuying(false)} onPaid={(pid) => nav(`/my-courses/${pid}`, { replace: true })} />}
    </>
  );
}

/** A course the client owns: schedule it, then follow progress and jump into the next workout. */
export function MyCourse() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: p, error, reload } = useApi<Purchase>(`/purchases/${id}`);
  useOnFocus(reload);
  if (error) return <div className="page no-tabs"><TopBar back="/shop" /><div className="error">{error}</div></div>;
  if (!p) return <Spinner />;

  const weeks = new Map<string, NonNullable<Purchase["workouts"]>>();
  for (const w of p.workouts ?? []) {
    const wk = w.title.match(/Week (\d+) Day \d+$/)?.[1] ?? "1";
    weeks.set(wk, [...(weeks.get(wk) ?? []), w]);
  }
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const today = ymd();

  return (
    <>
      <TopBar back="/shop" title={p.title} />
      <div className="page no-tabs stack" style={{ gap: 16 }}>
        <Cover course={p} size="lg">
          {p.started_on && (
            <div style={{ marginTop: 14 }}>
              <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
              <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>{p.done} of {p.total} workouts · {pct}%</div>
            </div>
          )}
        </Cover>

        {!p.started_on ? (
          <div className="card pad stack">
            <div>
              <h2>You're in! When do you want to start?</h2>
              <div className="small muted" style={{ marginTop: 4 }}>
                {p.weeks} weeks, {p.days_per_week} workouts a week. They'll show up on your Workouts tab like the ones {p.coach_name} sends you.
              </div>
            </div>
            <ScheduleForm purchase={p} onDone={reload} />
          </div>
        ) : (
          <>
            {p.next_workout_id ? (
              <div className="hero">
                <div className="muted small" style={{ fontWeight: 600 }}>Up next · {dayLabel(p.next_on!)}</div>
                <h2 style={{ marginTop: 2 }}>{p.workouts?.find((w) => w.id === p.next_workout_id)?.title.replace(`${p.title} `, "")}</h2>
                <button className="btn block" style={{ marginTop: 14 }} onClick={() => nav(`/workout/${p.next_workout_id}`)}>Open workout</button>
              </div>
            ) : p.done === p.total && p.total > 0 ? (
              <div className="card pad"><Empty icon="trophy" title="Course complete">Nice work. Message {p.coach_name} about what's next.</Empty></div>
            ) : null}
            {[...weeks.entries()].map(([wk, list]) => (
              <div key={wk}>
                <div className="section-title" style={{ marginTop: 4 }}>Week {wk}</div>
                <div className="list">
                  {list.map((w) => {
                    const missed = !w.completed_at && w.scheduled_on < today;
                    return (
                      <Link key={w.id} to={`/workout/${w.id}`} className="list-item">
                        <span className={`block-tag${w.completed_at ? " done" : ""}`}>{w.completed_at ? <Icon name="check" size={16} /> : w.title.match(/Day (\d+)$/)?.[1]}</span>
                        <div className="grow">
                          <div style={{ fontWeight: 600 }} className="ellipsis">{w.title.replace(`${p.title} `, "")}</div>
                          <div className="tiny faint">{dayLabel(w.scheduled_on, { long: true })}</div>
                        </div>
                        {missed && <span className="chip danger">Missed</span>}
                        <Icon name="chev" size={18} />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
        <Link to={`/shop/${p.course_id}`} className="btn ghost">About this course</Link>
      </div>
    </>
  );
}
