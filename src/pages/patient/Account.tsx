import { useState } from "react";
import { api } from "../../api";
import { useSession } from "../../session";
import { Icon } from "../../components/Icon";
import { Sheet, toast } from "../../components/ui";

export function SignOut() {
  return (
    <button
      className="btn block danger"
      onClick={async () => {
        await api.post("/auth/logout");
        location.href = "/";
      }}
    >
      <Icon name="logout" size={18} /> Sign out
    </button>
  );
}

export function PasswordButton() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  return (
    <>
      <button className="list-item" onClick={() => setOpen(true)}>
        <span className="grow">Change password</span>
        <span className="chev"><Icon name="chev" size={18} /></span>
      </button>
      {open && (
        <Sheet open onClose={() => setOpen(false)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.patch("/me", { currentPassword: cur, newPassword: next });
                toast("Password updated");
                setOpen(false);
              } catch (err) {
                toast((err as Error).message);
              }
            }}
          >
            <h2>Change password</h2>
            <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
            <input className="input" type="password" placeholder="New password (8+ characters)" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
            <button className="btn primary block">Save</button>
          </form>
        </Sheet>
      )}
    </>
  );
}

export function Account() {
  const { me } = useSession();
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    <div className="page">
      <div className="hero" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: "rgb(255 255 255 / 22%)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>
            {me.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2>{me.name}</h2>
            <div className="muted small row" style={{ gap: 6 }}><Icon name="trophy" size={16} /> {me.completed_count} workouts completed</div>
          </div>
        </div>
      </div>

      {me.therapist_name && (
        <div className="list">
          <div className="list-item">
            <Icon name="users" size={20} />
            <div className="grow">
              <div className="small faint">Your coach</div>
              <div style={{ fontWeight: 600 }}>{me.therapist_name}</div>
            </div>
          </div>
        </div>
      )}

      {!standalone && (
        <>
          <div className="section-title">Install</div>
          <div className="card pad small">
            <b>Add to your home screen:</b> in Safari tap the Share button, then <b>Add to Home Screen</b>. It opens full-screen like a regular app.
          </div>
        </>
      )}

      <div className="section-title">Settings</div>
      <div className="list" style={{ marginBottom: 16 }}>
        <div className="list-item">
          <span className="grow muted">{me.email}</span>
        </div>
        <PasswordButton />
      </div>
      <SignOut />
    </div>
  );
}
