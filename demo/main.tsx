import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { resetDemo, signInAs, startBackend } from "./backend";
import "../src/styles.css";
import "./demo.css";

type View = { role: "coach" | "client"; n: number };

const CLIENTS = ["Kai", "Maya", "Jordan", "Priya", "Sam"];

// Store links are built from location.origin, which is meaningless inside the demo page.
const storePath = (href?: string | null) => href?.match(/\/store\/[^?#]*$/)?.[0];

/** Links that would open a new tab (the public store, course previews) open inside the demo instead. */
function InPageLinks() {
  const navigate = useNavigate();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a[target="_blank"]');
      const path = storePath(a?.getAttribute("href"));
      if (!path) return;
      e.preventDefault();
      navigate(path);
    };
    const open = window.open;
    window.open = (url?: string | URL, ...rest) => {
      const path = storePath(String(url));
      if (!path) return open(url, ...rest);
      navigate(path);
      return null;
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.open = open;
    };
  }, [navigate]);
  return null;
}

function Demo({ App }: { App: React.ComponentType }) {
  const [view, setView] = useState<View>({ role: "coach", n: 1 });
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(true);

  const go = async (v: View, reset = false) => {
    setBusy(true);
    if (reset) await resetDemo();
    await signInAs(v.role, v.n);
    setView(v);
    setEpoch((e) => e + 1);
    setBusy(false);
  };

  useEffect(() => {
    go(view);
    (globalThis as Record<string, unknown>).__demoHome = () => go(view);
  }, []);

  return (
    <>
      <div className="demo-bar">
        <span className="demo-tag">Demo</span>
        <div className="demo-seg" role="tablist">
          <button role="tab" aria-selected={view.role === "coach"} onClick={() => go({ role: "coach", n: 1 })}>
            Coach
          </button>
          <button role="tab" aria-selected={view.role === "client"} onClick={() => go({ role: "client", n: view.role === "client" ? view.n : 1 })}>
            Client
          </button>
        </div>
        {view.role === "client" && (
          <select value={view.n} onChange={(e) => go({ role: "client", n: Number(e.target.value) })} aria-label="Client">
            {CLIENTS.map((c, i) => (
              <option key={c} value={i + 1}>{c}</option>
            ))}
          </select>
        )}
        <span className="demo-grow" />
        <button className="demo-reset" onClick={() => go(view, true)} title="Wipe your changes and reseed">
          Reset data
        </button>
      </div>
      <div className={"demo-app" + (view.role === "client" ? " phone" : "")}>
        {!busy && (
          <MemoryRouter key={epoch}>
            <InPageLinks />
            <App />
          </MemoryRouter>
        )}
      </div>
    </>
  );
}

startBackend().then(async () => {
  // The app module kicks off /api/me when it loads, so load it only after fetch is patched.
  const { default: App } = await import("../src/App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Demo App={App} />
    </StrictMode>,
  );
});
