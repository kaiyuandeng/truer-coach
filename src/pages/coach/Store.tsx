import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../../hooks";
import { useSession } from "../../session";
import { relTime } from "../../dates";
import { Icon } from "../../components/Icon";
import { Empty, Spinner, toast } from "../../components/ui";
import { CourseCard, money, storeUrl, type Course } from "../store/shared";

type Sale = {
  id: string;
  price_cents: number;
  created_at: string;
  started_on: string | null;
  course_id: string;
  course_title: string;
  buyer_id: string;
  buyer_name: string;
  total: number;
  done: number;
};

/** The coach's course store: what's for sale, how it's selling, and who's working through what. */
export function Store() {
  const { me } = useSession();
  const nav = useNavigate();
  const { data, loading } = useApi<{ courses: Course[]; sales: Sale[]; totals: { revenue_cents: number; revenue_30d_cents: number; sales: number } }>("/courses");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(storeUrl(me.id));
      toast("Store link copied");
    } catch {
      prompt("Your store link", storeUrl(me.id));
    }
  };

  if (loading && !data) return <Spinner />;
  const courses = data?.courses ?? [];
  const sales = data?.sales ?? [];
  const live = courses.filter((c) => c.published).length;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Store</h1>
          <div className="small muted">Sell your programs as self-guided courses.</div>
        </div>
        <div className="row">
          <a className="btn" href={`/store/${me.id}`} target="_blank" rel="noreferrer"><Icon name="eye" size={18} /> View store</a>
          <button className="btn" onClick={copyLink}><Icon name="link" size={18} /> Copy link</button>
          <button className="btn primary" onClick={() => nav("/courses/new")}><Icon name="plus" size={18} /> New course</button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="l">Revenue, last 30 days</div><div className="v">{money(data?.totals.revenue_30d_cents ?? 0).replace("Free", "$0")}</div></div>
        <div className="kpi"><div className="l">All-time revenue</div><div className="v">{money(data?.totals.revenue_cents ?? 0).replace("Free", "$0")}</div></div>
        <div className="kpi"><div className="l">Courses sold</div><div className="v">{data?.totals.sales ?? 0}</div></div>
        <div className="kpi"><div className="l">Live courses</div><div className="v">{live}<span className="small faint" style={{ fontWeight: 600 }}> / {courses.length}</span></div></div>
      </div>

      {!courses.length ? (
        <div className="card pad">
          <Empty icon="store" title="No courses yet">
            Turn any program into a course with a price and a description. Clients buy it in the app, or anyone can buy from your store link.
            <div style={{ marginTop: 12 }}><button className="btn primary" onClick={() => nav("/courses/new")}><Icon name="plus" size={18} /> Create your first course</button></div>
          </Empty>
        </div>
      ) : (
        <div className="grid three">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              onClick={() => nav(`/courses/${c.id}`)}
              footer={
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <span className="price">{money(c.price_cents)}</span>
                  {c.published ? <span className="chip accent">Live</span> : <span className="chip">Draft</span>}
                  <span className="tiny faint">{c.sales} sold</span>
                </div>
              }
            />
          ))}
        </div>
      )}

      <div className="section-title">Recent sales</div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Buyer</th><th>Course</th><th>Price</th><th>Progress</th><th>When</th></tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="click" onClick={() => nav(`/clients/${s.buyer_id}`)}>
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="avatar">{s.buyer_name.slice(0, 1)}</span>
                    <span style={{ fontWeight: 650 }}>{s.buyer_name}</span>
                  </div>
                </td>
                <td className="small"><Link to={`/courses/${s.course_id}`} onClick={(e) => e.stopPropagation()}>{s.course_title}</Link></td>
                <td className="small">{money(s.price_cents)}</td>
                <td style={{ minWidth: 140 }}>
                  {s.started_on && s.total ? (
                    <div>
                      <div className="meter"><div style={{ width: `${(s.done / s.total) * 100}%`, background: "var(--accent)" }} /></div>
                      <div className="tiny faint" style={{ marginTop: 4 }}>{s.done} of {s.total} workouts</div>
                    </div>
                  ) : (
                    <span className="chip">Not started</span>
                  )}
                </td>
                <td className="small faint" style={{ whiteSpace: "nowrap" }}>{relTime(s.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sales.length && <div className="faint center" style={{ padding: 24 }}>No sales yet. Share your store link to get the first one.</div>}
      </div>
    </div>
  );
}
