import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, ApiError, type Me } from "./api";
import { SessionContext } from "./session";
import { Spinner, Toaster } from "./components/ui";
import { useOnFocus } from "./hooks";

const AuthRoutes = lazy(() => import("./pages/Auth"));
const PatientRoutes = lazy(() => import("./pages/patient/routes"));
const CoachRoutes = lazy(() => import("./pages/coach/routes"));

// Start the session check and the likely next chunk while React boots, instead of one after the other.
let firstMe: Promise<Me> | null = api.get<Me>("/me");
try {
  const role = localStorage.getItem("ptc-role");
  if (role === "therapist") import("./pages/coach/routes");
  else if (role === "patient") import("./pages/patient/routes");
} catch {}

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [unread, setUnread] = useState(0);
  const loc = useLocation();

  const refresh = useCallback(async () => {
    try {
      const p = firstMe ?? api.get<Me>("/me");
      firstMe = null;
      const m = await p;
      try {
        localStorage.setItem("ptc-role", m.role);
      } catch {}
      setMe(m);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else setMe((m) => m ?? null);
    }
  }, []);

  const refreshUnread = useCallback(() => {
    api.get<{ messages: number }>("/unread").then((r) => setUnread(r.messages), () => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!me) return;
    refreshUnread();
    const t = setInterval(refreshUnread, 60_000);
    return () => clearInterval(t);
  }, [me, refreshUnread]);
  useOnFocus(refreshUnread);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  if (me === undefined) return <Spinner />;

  if (!me)
    return (
      <>
        <Suspense fallback={<Spinner />}>
          <AuthRoutes onDone={refresh} />
        </Suspense>
        <Toaster />
      </>
    );

  return (
    <SessionContext.Provider value={{ me, refresh, unread, refreshUnread }}>
      <Suspense fallback={<Spinner />}>{me.role === "patient" ? <PatientRoutes /> : <CoachRoutes />}</Suspense>
      <Toaster />
    </SessionContext.Provider>
  );
}
