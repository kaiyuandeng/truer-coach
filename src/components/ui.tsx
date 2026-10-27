import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grabber" />
        {children}
      </div>
    </>
  );
}

export function TopBar({ title, back, right, wide }: { title?: ReactNode; back?: boolean | string; right?: ReactNode; wide?: boolean }) {
  const nav = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className={`topbar${scrolled ? " scrolled" : ""}${wide ? " wide" : ""}`}>
      <div className="topbar-inner">
        {back ? (
          <button
            className="icon-btn plain"
            aria-label="Back"
            onClick={() => (typeof back === "string" ? nav(back) : history.length > 1 ? nav(-1) : nav("/"))}
          >
            <Icon name="back" />
          </button>
        ) : (
          <div style={{ width: 40 }} />
        )}
        <div className="title ellipsis">{title}</div>
        <div className="row" style={{ minWidth: 40, justifyContent: "flex-end" }}>{right}</div>
      </div>
    </div>
  );
}

const PAIN_COLORS = ["#12b5a0", "#3dbb8f", "#6cc17a", "#9cc565", "#c9c451", "#e8b33f", "#ef9a35", "#ef7d33", "#e8603a", "#e04646", "#c9304f"];

export function painColor(n: number) {
  return PAIN_COLORS[Math.max(0, Math.min(10, Math.round(n)))];
}

export function PainPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <div className="pain" role="radiogroup" aria-label="Pain from 0 to 10">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            className={value === i ? "on" : ""}
            style={value === i ? { background: painColor(i) } : undefined}
            onClick={() => onChange(value === i ? null : i)}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="pain-legend">
        <span>No pain</span>
        <span>Worst</span>
      </div>
    </div>
  );
}

export function Check({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`check${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        if (!on && navigator.vibrate) navigator.vibrate(12);
        onClick();
      }}
    >
      <Icon name="check" />
    </button>
  );
}

let toastTimer: number | undefined;
export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent("ptc-toast", { detail: msg }));
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener("ptc-toast", on);
    return () => window.removeEventListener("ptc-toast", on);
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <div className="small" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}
