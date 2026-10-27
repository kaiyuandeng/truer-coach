import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApi } from "../hooks";
import { Spinner } from "../components/ui";

function Brand() {
  return (
    <div className="center" style={{ marginBottom: 20 }}>
      <div className="brand-mark" style={{ fontSize: 26, padding: 0 }}>
        Rehab<span>Loop</span>
      </div>
      <div className="muted small">Your physical therapy, between visits.</div>
    </div>
  );
}

function useSubmit(fn: () => Promise<unknown>, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const nav = useNavigate();
  const { busy, error, submit } = useSubmit(() => api.post("/auth/login", { email, password }), () => {
    nav("/", { replace: true });
    onDone();
  });
  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit}>
        <Brand />
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary block lg" disabled={busy}>Sign in</button>
        <DemoLinks />
        <div className="small muted center">
          Physical therapist? <Link to="/signup">Create a coach account</Link>
          <br />
          Patient? Use the invite link from your therapist.
        </div>
      </form>
    </div>
  );
}

function DemoLinks() {
  const { data } = useApi<{ demo: boolean }>("/config");
  if (!data?.demo) return null;
  return (
    <div className="card pad stack" style={{ background: "var(--brand-soft)", boxShadow: "none", gap: 8 }}>
      <div className="small" style={{ fontWeight: 650, color: "var(--brand)" }}>Take a look around (demo data)</div>
      <div className="row">
        <a className="btn grow" href="/demo/coach">Coach view</a>
        <a className="btn grow" href="/demo/client">Client view</a>
      </div>
    </div>
  );
}

export function Signup({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", signupCode: "" });
  const nav = useNavigate();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const { busy, error, submit } = useSubmit(() => api.post("/auth/signup", form), () => {
    nav("/", { replace: true });
    onDone();
  });
  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit}>
        <Brand />
        <h2>Create a coach account</h2>
        <label className="field">
          <span>Your name</span>
          <input className="input" autoComplete="name" value={form.name} onChange={set("name")} required />
        </label>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} required />
        </label>
        <label className="field">
          <span>Sign-up code (if you were given one)</span>
          <input className="input" value={form.signupCode} onChange={set("signupCode")} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary block lg" disabled={busy}>Create account</button>
        <div className="small center"><Link to="/">I already have an account</Link></div>
      </form>
    </div>
  );
}

export function Join({ onDone }: { onDone: () => void }) {
  const { code = "" } = useParams();
  const invite = useApi<{ name: string; therapist_name: string }>(`/invite/${code}`);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const nav = useNavigate();
  const { busy, error, submit } = useSubmit(() => api.post(`/invite/${code}`, { email, password }), () => {
    nav("/", { replace: true });
    onDone();
  });
  if (invite.loading) return <Spinner />;
  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit}>
        <Brand />
        {invite.error ? (
          <>
            <div className="error">{invite.error}</div>
            <Link className="btn block" to="/">Go to sign in</Link>
          </>
        ) : (
          <>
            <h2>Hi {invite.data?.name}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {invite.data?.therapist_name} invited you. Set up your login to see your exercises.
            </p>
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>Choose a password</span>
              <input className="input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="btn primary block lg" disabled={busy}>Get started</button>
          </>
        )}
      </form>
    </div>
  );
}
