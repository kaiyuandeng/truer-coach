import { Navigate, Route, Routes } from "react-router-dom";
import { PatientShell } from "./Shell";
import { Today } from "./Today";
import { WorkoutPage } from "./Workout";
import { Messages } from "./Messages";
import { Account } from "./Account";

/** The client's phone app; loaded as its own chunk so coaches' dashboard code stays out of it. */
export default function PatientRoutes() {
  return (
    <Routes>
      <Route path="/workout/:id" element={<WorkoutPage />} />
      <Route element={<PatientShell />}>
        <Route path="/" element={<Today />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
