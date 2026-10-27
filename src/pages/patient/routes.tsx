import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PatientShell } from "./Shell";
import { Today } from "./Today";
import { WorkoutPage } from "./Workout";
import { Messages } from "./Messages";
import { Account } from "./Account";
import { MyCourse, Shop, ShopCourse } from "./Shop";

/** The client's phone app; loaded as its own chunk so coaches' dashboard code stays out of it. */
export default function PatientRoutes() {
  return (
    <Routes>
      <Route path="/workout/:id" element={<WorkoutPage />} />
      <Route path="/shop/:courseId" element={<ShopCourse />} />
      <Route path="/my-courses/:id" element={<MyCourse />} />
      <Route path="/store/:coachId" element={<Navigate to="/shop" replace />} />
      <Route path="/store/:coachId/:courseId" element={<StoreRedirect />} />
      <Route element={<PatientShell />}>
        <Route path="/" element={<Today />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** Signed-in clients open shared store links inside the app. */
function StoreRedirect() {
  const { courseId } = useParams();
  return <Navigate to={`/shop/${courseId}`} replace />;
}
