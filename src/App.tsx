import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, ApiError, type Me } from "./api";
import { SessionContext } from "./session";
import { Spinner, Toaster } from "./components/ui";
import { useOnFocus } from "./hooks";
import { Login, Signup, Join } from "./pages/Auth";
import { PatientShell } from "./pages/patient/Shell";
import { Today } from "./pages/patient/Today";
import { WorkoutPage } from "./pages/patient/Workout";
import { Messages } from "./pages/patient/Messages";
import { Account } from "./pages/patient/Account";
import { CoachShell } from "./pages/coach/Shell";
import { Inbox } from "./pages/coach/Inbox";
import { Clients } from "./pages/coach/Clients";
import { ClientDetail } from "./pages/coach/ClientDetail";
import { Library } from "./pages/coach/Library";
import { TemplateEditor } from "./pages/coach/TemplateEditor";
import { ProgramEditor } from "./pages/coach/ProgramEditor";
import { Exercises } from "./pages/coach/Exercises";
import { CoachWorkout } from "./pages/coach/CoachWorkout";
import { CoachAccount } from "./pages/coach/CoachAccount";

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [unread, setUnread] = useState(0);
  const loc = useLocation();

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>("/me"));
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
        <Routes>
          <Route path="/signup" element={<Signup onDone={refresh} />} />
          <Route path="/join/:code" element={<Join onDone={refresh} />} />
          <Route path="*" element={<Login onDone={refresh} />} />
        </Routes>
        <Toaster />
      </>
    );

  return (
    <SessionContext.Provider value={{ me, refresh, unread, refreshUnread }}>
      {me.role === "patient" ? (
        <Routes>
          <Route path="/workout/:id" element={<WorkoutPage />} />
          <Route element={<PatientShell />}>
            <Route path="/" element={<Today />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/account" element={<Account />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route element={<CoachShell />}>
            <Route path="/" element={<Inbox />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/library" element={<Library />} />
            <Route path="/templates/:id" element={<TemplateEditor />} />
            <Route path="/programs/:id" element={<ProgramEditor />} />
            <Route path="/exercises" element={<Exercises />} />
            <Route path="/workouts/:id" element={<CoachWorkout />} />
            <Route path="/account" element={<CoachAccount />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      <Toaster />
    </SessionContext.Provider>
  );
}
