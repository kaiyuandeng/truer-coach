import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../../hooks";
import { Icon } from "../../components/Icon";
import { Empty, Spinner } from "../../components/ui";
import { CheckoutSheet, CourseCard, CourseDetailView, type Course, type CourseDetail } from "./shared";

/**
 * The coach's shareable storefront (/store/:coachId). Anyone can browse; buying signs a new person
 * up as the coach's client. Coaches see it as a preview of their own store.
 */
export function PublicStore({ onSignedIn, coachView }: { onSignedIn?: () => void; coachView?: boolean }) {
  const { coachId = "", courseId } = useParams();
  return (
    <div className="store-page">
      <header className="store-head">
        <div className="store-head-inner">
          <Link to={`/store/${coachId}`} className="brand-mark" style={{ padding: 0, color: "var(--text)" }}>Truer<span>Coach</span></Link>
          {coachView ? (
            <Link className="btn sm" to="/courses"><Icon name="back" size={16} /> Back to your store</Link>
          ) : !onSignedIn ? null : (
            <Link className="btn sm ghost" to="/">Sign in</Link>
          )}
        </div>
      </header>
      <div className="page no-tabs">
        {courseId ? <StoreCourse coachId={coachId} courseId={courseId} onSignedIn={onSignedIn} coachView={coachView} /> : <StoreFront coachId={coachId} />}
      </div>
    </div>
  );
}

function StoreFront({ coachId }: { coachId: string }) {
  const nav = useNavigate();
  const { data, error } = useApi<{ coach: { name: string }; courses: Course[] }>(`/store/${coachId}`);
  if (error) return <Empty icon="store" title="Store not found">{error}</Empty>;
  if (!data) return <Spinner />;
  return (
    <div>
      <div className="store-intro">
        <span className="avatar lg">{data.coach.name.slice(0, 1)}</span>
        <div>
          <h1>Courses by {data.coach.name}</h1>
          <div className="muted small">Physical therapy programs you can follow at home, with video for every exercise.</div>
        </div>
      </div>
      {data.courses.length ? (
        <div className="stack">
          {data.courses.map((c) => <CourseCard key={c.id} course={c} onClick={() => nav(`/store/${coachId}/${c.id}`)} />)}
        </div>
      ) : (
        <div className="card pad"><Empty icon="bag" title="Nothing for sale yet">Check back soon.</Empty></div>
      )}
    </div>
  );
}

function StoreCourse({ coachId, courseId, onSignedIn, coachView }: { coachId: string; courseId: string; onSignedIn?: () => void; coachView?: boolean }) {
  const nav = useNavigate();
  const { data, error } = useApi<CourseDetail>(`/store/${coachId}/courses/${courseId}`);
  const [buying, setBuying] = useState(false);
  if (error) return <Empty icon="store" title="Course not found">{error}</Empty>;
  if (!data) return <Spinner />;
  return (
    <>
      <Link to={`/store/${coachId}`} className="row small" style={{ gap: 4, marginBottom: 12 }}>
        <Icon name="back" size={16} /> All courses
      </Link>
      <CourseDetailView
        course={data}
        preview={coachView}
        cta={
          coachView ? (
            <Link className="btn primary" to={`/courses/${data.id}`}><Icon name="edit" size={18} /> Edit course</Link>
          ) : (
            <button className="btn primary" onClick={() => setBuying(true)}><Icon name="bag" size={18} /> Buy course</button>
          )
        }
      />
      {buying && (
        <CheckoutSheet
          course={data}
          guest
          onClose={() => setBuying(false)}
          onPaid={(purchaseId) => {
            // Checkout created the account and signed them in; land them on their new course.
            nav(`/my-courses/${purchaseId}`, { replace: true });
            onSignedIn?.();
          }}
        />
      )}
    </>
  );
}
