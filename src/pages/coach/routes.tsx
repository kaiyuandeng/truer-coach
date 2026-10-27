import { Navigate, Route, Routes } from "react-router-dom";
import { CoachShell } from "./Shell";
import { Overview } from "./Overview";
import { Inbox } from "./Inbox";
import { Clients } from "./Clients";
import { ClientDetail } from "./ClientDetail";
import { Library } from "./Library";
import { TemplateEditor } from "./TemplateEditor";
import { ProgramEditor } from "./ProgramEditor";
import { Exercises } from "./Exercises";
import { CoachWorkout } from "./CoachWorkout";
import { CoachAccount } from "./CoachAccount";
import "./coach.css";

/** Everything a coach sees; loaded as its own chunk so clients never download it. */
export default function CoachRoutes() {
  return (
    <Routes>
      <Route element={<CoachShell />}>
        <Route path="/" element={<Overview />} />
        <Route path="/inbox" element={<Inbox />} />
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
  );
}
